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
  environment,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { exec } from "child_process";
import { homedir } from "os";
import { join } from "path";

interface FormValues {
  url: string;
  mediaType: string;
  videoQuality?: string;
  audioFormat?: string;
  destination: string;
}

export default function Command() {
  const [clipboardUrl, setClipboardUrl] = useState("");
  const [ytDlpOk, setYtDlpOk] = useState<boolean | null>(null);
  const [mediaType, setMediaType] = useState("audio");
  const [downloadLogs, setDownloadLogs] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Récupérer le contenu du presse-papier au chargement
    Clipboard.readText().then((text) => {
      if (text && /^https?:\/\//.test(text)) {
        setClipboardUrl(text);
      }
    });

    // Vérifier si yt-dlp est installé
    checkYtDlp();
  }, []);

  function checkYtDlp() {
    // Chemins possibles où yt-dlp peut être installé
    const possiblePaths = [
      "yt-dlp", // PATH par défaut
      "/usr/local/bin/yt-dlp", // Homebrew Intel
      "/opt/homebrew/bin/yt-dlp", // Homebrew Apple Silicon
      "/usr/bin/yt-dlp", // Installation système
      "~/.local/bin/yt-dlp", // Installation pip user
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

          // Si tous les chemins ont été vérifiés et aucun trouvé
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

    // Options selon le type de média
    if (values.mediaType === "audio") {
      cmd += `-x --audio-format ${values.audioFormat || "mp3"} `;
    } else {
      // Vidéo avec qualité spécifique
      switch (values.videoQuality) {
        case "4k":
          cmd += `-f "bestvideo[height<=2160]+bestaudio/best[height<=2160]" `;
          break;
        case "1080p":
          cmd += `-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" `;
          break;
        case "720p":
          cmd += `-f "bestvideo[height<=720]+bestaudio/best[height<=720]" `;
          break;
        case "480p":
          cmd += `-f "bestvideo[height<=480]+bestaudio/best[height<=480]" `;
          break;
        default:
          cmd += `-f best `;
      }
    }

    // Dossier de destination
    const destination = values.destination || join(homedir(), "Downloads");
    cmd += `-o '${destination}/%(title)s.%(ext)s' `;

    // Options additionnelles
    cmd += `--no-playlist --embed-metadata `;

    // URL à télécharger
    cmd += `"${values.url}"`;

    return cmd;
  }

  function handleSubmit(values: FormValues) {
    // Vérifications préalables
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

    // Toast de démarrage
    showToast({
      style: Toast.Style.Animated,
      title: "Téléchargement en cours...",
      message: "Traitement de la vidéo avec yt-dlp",
    });

    // Exécution de la commande avec environnement élargi
    const extendedPath = `${process.env.PATH || ""}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:${process.env.HOME || ""}/.local/bin`;

    const downloadProcess = exec(
      // Variable renommée pour éviter le conflit
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

          // Fermer l'interface après succès
          setTimeout(() => {
            popToRoot();
            closeMainWindow();
          }, 2000);
        }
      },
    );

    // Écouter les outputs en temps réel
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

  // Fonction pour obtenir l'icône et la couleur selon l'état de yt-dlp
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
            shortcut={{ modifiers: ["cmd"], key: "d" }} // Raccourci modifié
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
        <Form.Dropdown id="videoQuality" title="Qualité vidéo" defaultValue="1080p">
          <Form.Dropdown.Item value="4k" title="4K (2160p)" icon={Icon.Star} />
          <Form.Dropdown.Item value="1080p" title="1080p (Full HD)" icon={Icon.Circle} />
          <Form.Dropdown.Item value="720p" title="720p (HD)" icon={Icon.CircleProgress} />
          <Form.Dropdown.Item value="480p" title="480p (SD)" icon={Icon.Dot} />
          <Form.Dropdown.Item value="best" title="Meilleure disponible" icon={Icon.Crown} />
        </Form.Dropdown>
      )}

      {mediaType === "audio" && (
        <Form.Dropdown id="audioFormat" title="Format audio" defaultValue="mp3">
          <Form.Dropdown.Item value="mp3" title="MP3 (recommandé)" icon={Icon.Music} />
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
