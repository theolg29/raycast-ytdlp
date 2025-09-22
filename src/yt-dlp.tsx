import {
  ActionPanel,
  Action,
  Form,
  showToast,
  Toast,
  Clipboard,
  Icon,
  popToRoot,
  closeMainWindow,
  showInFinder,
  open,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { exec } from "child_process";
import { homedir } from "os";
import { join } from "path";

interface FormValues {
  url: string;
  mediaType: string;
  videoQuality: string;
  videoFormat: string;
  audioFormat: string;
  destination: string;
}

export default function Command() {
  const [clipboardUrl, setClipboardUrl] = useState("");
  const [ytDlpOk, setYtDlpOk] = useState<boolean | null>(null);
  const [mediaType, setMediaType] = useState("audio");
  const [downloadLogs, setDownloadLogs] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    Clipboard.readText().then((text) => {
      if (text && /^https?:\/\//.test(text)) {
        setClipboardUrl(text);
      }
    });

    checkYtDlp();
  }, []);

  function checkYtDlp() {
    const possiblePaths = [
      "yt-dlp",
      "/usr/local/bin/yt-dlp",
      "/opt/homebrew/bin/yt-dlp",
      "/usr/bin/yt-dlp",
      "~/.local/bin/yt-dlp",
    ];

    let found = false;
    let checkedCount = 0;

    possiblePaths.forEach((path) => {
      exec(
        `which ${path.replace("~", process.env.HOME || "")} 2>/dev/null || command -v ${path} 2>/dev/null || ${path} --version 2>/dev/null`,
        (error, stdout) => {
          checkedCount++;

          if (!found && !error && stdout) {
            found = true;
            setYtDlpOk(true);
          }

          if (checkedCount === possiblePaths.length && !found) {
            setYtDlpOk(false);
          }
        },
      );
    });
  }

  function addLog(message: string) {
    setDownloadLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }

  function buildCommand(values: FormValues): string {
    let cmd = "yt-dlp ";

    if (values.mediaType === "audio") {
      if (values.audioFormat === "best") {
        cmd += "-x --audio-quality 0 ";
      } else {
        cmd += `-x --audio-format ${values.audioFormat} `;
      }
    } else {
      // mediaType === "video"
      const videoQualityFilter =
        values.videoQuality === "best" ? "" : `[height<=${values.videoQuality.replace("p", "")}]`;
      const videoFormatFilter = values.videoFormat === "best" ? "" : `[ext=${values.videoFormat}]`;

      // On demande la meilleure vidéo possible et le meilleur audio possible
      cmd += `-f "bestvideo${videoQualityFilter}+bestaudio/best" `;

      // Si un format spécifique est choisi, on force le re-encodage
      if (values.videoFormat !== "best") {
        cmd += `--recode-video ${values.videoFormat} `;
      }
    }

    const destination = values.destination || join(homedir(), "Downloads");
    cmd += `-o '${destination}/%(title)s.%(ext)s' `;

    cmd += `--no-playlist --embed-metadata `;

    cmd += `"${values.url}"`;

    return cmd;
  }

  function handleSubmit(values: FormValues) {
    if (!ytDlpOk) {
      showToast({
        style: Toast.Style.Failure,
        title: "Erreur",
        message: "yt-dlp n'est pas installé ou détecté sur le système",
      });
      return;
    }

    if (!values.url) {
      showToast({
        style: Toast.Style.Failure,
        title: "Erreur",
        message: "Veuillez saisir une URL",
      });
      return;
    }

    setIsDownloading(true);
    setDownloadLogs([]);

    const cmd = buildCommand(values);
    addLog(`Commande: ${cmd}`);

    showToast({
      style: Toast.Style.Animated,
      title: "Téléchargement en cours...",
      message: "Traitement de la vidéo avec yt-dlp",
    });

    const extendedPath = `${process.env.PATH || ""}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:${process.env.HOME || ""}/.local/bin`;

    const downloadProcess = exec(
      cmd,
      {
        env: Object.assign({}, process.env, {
          PATH: extendedPath,
        }),
      },
      (error, stdout, stderr) => {
        setIsDownloading(false);

        if (error) {
          addLog(`Erreur: ${error.message}`);
          if (stderr) addLog(`stderr: ${stderr}`);

          showToast({
            style: Toast.Style.Failure,
            title: "Échec du téléchargement",
            message: "Vérifiez l'URL et votre connexion internet",
          });
        } else {
          addLog("Téléchargement terminé avec succès !");

          showToast({
            style: Toast.Style.Success,
            title: "Téléchargement terminé !",
            message: "Le fichier a été sauvegardé avec succès",
          });

          setTimeout(() => {
            popToRoot();
            closeMainWindow();
          }, 2000);
        }
      },
    );

    if (downloadProcess.stdout) {
      downloadProcess.stdout.on("data", (data) => {
        const output = data.toString().trim();
        if (output) {
          addLog(output);
        }
      });
    }

    if (downloadProcess.stderr) {
      downloadProcess.stderr.on("data", (data) => {
        const output = data.toString().trim();
        if (output && !output.includes("WARNING")) {
          addLog(`Info: ${output}`);
        }
      });
    }
  }

  function getYtDlpStatus() {
    if (ytDlpOk === null) {
      return {
        text: "Vérification de yt-dlp...",
        icon: Icon.CircleProgress,
        iconColor: "yellow" as const,
      };
    } else if (ytDlpOk) {
      return {
        text: "yt-dlp détecté ✓",
        icon: Icon.CheckCircle,
        iconColor: "green" as const,
      };
    } else {
      return {
        text: "yt-dlp non détecté ✗",
        icon: Icon.XMarkCircle,
        iconColor: "red" as const,
      };
    }
  }

  const status = getYtDlpStatus();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={handleSubmit}
            title="Télécharger"
            icon={Icon.Download}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
          />
          <Action
            title="Ouvrir le dossier de destination"
            icon={Icon.Folder}
            onAction={() => {
              const destination = join(homedir(), "Downloads");
              showInFinder(destination);
            }}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
          <Action
            title="Coller depuis le presse-papier"
            icon={Icon.Clipboard}
            onAction={async () => {
              const text = await Clipboard.readText();
              if (text && /^https?:\/\//.test(text)) {
                setClipboardUrl(text);
                showToast({
                  style: Toast.Style.Success,
                  title: "URL collée !",
                  message: text,
                });
              }
            }}
            shortcut={{ modifiers: ["cmd"], key: "v" }}
          />
          <Action
            title="Installer/Mettre à jour yt-dlp"
            icon={Icon.Terminal}
            onAction={() => {
              showToast({
                style: Toast.Style.Animated,
                title: "Installation de yt-dlp",
                message: "Exécutez: brew install yt-dlp",
              });
              open("https://github.com/yt-dlp/yt-dlp#installation");
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="État de yt-dlp" text={status.text} icon={status.icon} iconColor={status.iconColor} />

      <Form.TextField
        id="url"
        title="URL de la vidéo"
        placeholder="https://www.youtube.com/watch?v=..."
        value={clipboardUrl}
        onChange={setClipboardUrl}
        info="L'URL sera automatiquement détectée depuis votre presse-papier"
      />

      <Form.Dropdown id="mediaType" title="Type de média" value={mediaType} onChange={setMediaType}>
        <Form.Dropdown.Item value="audio" title="Audio seulement" icon={Icon.Music} />
        <Form.Dropdown.Item value="video" title="Vidéo" icon={Icon.Video} />
      </Form.Dropdown>

      {mediaType === "video" && (
        <>
          <Form.Dropdown id="videoQuality" title="Qualité vidéo" defaultValue="best">
            <Form.Dropdown.Item value="best" title="Meilleure qualité" icon={Icon.Star} />
            <Form.Dropdown.Item value="2160p" title="4K (2160p)" icon={Icon.Star} />
            <Form.Dropdown.Item value="1440p" title="2K (1440p)" icon={Icon.Circle} />
            <Form.Dropdown.Item value="1080p" title="1080p (Full HD)" icon={Icon.Circle} />
            <Form.Dropdown.Item value="720p" title="720p (HD)" icon={Icon.CircleProgress} />
            <Form.Dropdown.Item value="480p" title="480p (SD)" icon={Icon.Dot} />
          </Form.Dropdown>
          <Form.Dropdown id="videoFormat" title="Format vidéo" defaultValue="best">
            <Form.Dropdown.Item value="best" title="Meilleur format" icon={Icon.Star} />
            <Form.Dropdown.Item value="mp4" title="MP4" icon={Icon.Video} />
            <Form.Dropdown.Item value="webm" title="WebM" icon={Icon.Globe} />
          </Form.Dropdown>
        </>
      )}

      {mediaType === "audio" && (
        <Form.Dropdown id="audioFormat" title="Format audio" defaultValue="best">
          <Form.Dropdown.Item value="best" title="Meilleure qualité" icon={Icon.Star} />
          <Form.Dropdown.Item value="mp3" title="MP3" icon={Icon.Music} />
          <Form.Dropdown.Item value="m4a" title="M4A (AAC)" icon={Icon.SpeakerArrowDown} />
          <Form.Dropdown.Item value="flac" title="FLAC (sans perte)" icon={Icon.Crown} />
          <Form.Dropdown.Item value="wav" title="WAV (non compressé)" icon={Icon.Waveform} />
        </Form.Dropdown>
      )}

      <Form.TextField
        id="destination"
        title="Dossier de destination"
        placeholder={join(homedir(), "Downloads")}
        info="Laissez vide pour utiliser le dossier Téléchargements par défaut"
      />

      {downloadLogs.length > 0 && (
        <Form.Description title="Logs du téléchargement" text={downloadLogs.slice(-3).join("\n")} />
      )}

      {isDownloading && (
        <Form.Description
          title="État"
          text="⏳ Téléchargement en cours..."
          icon={Icon.CircleProgress}
          iconColor="blue"
        />
      )}
    </Form>
  );
}
