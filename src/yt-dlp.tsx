import { ActionPanel, Action, Form, showToast, Toast, Clipboard, Icon, popToRoot, closeMainWindow } from "@raycast/api";
import React, { useState, useEffect } from "react";
import { exec } from "child_process";

interface FormValues {
  url: string;
  format: string;
  destination: string;
}

export default function Command() {
  const [clipboardUrl, setClipboardUrl] = useState("");
  const [ytDlpOk, setYtDlpOk] = useState<boolean | null>(null);

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

    // Détermine le chemin correct de yt-dlp
    const ytdlpPaths = ["yt-dlp", "/usr/local/bin/yt-dlp", "/opt/homebrew/bin/yt-dlp", "/usr/bin/yt-dlp"];

    // Construction de la commande avec PATH élargi
    const pathEnv = `PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:~/.local/bin`;
    let cmd = `${pathEnv} yt-dlp `;

    // Options selon le format choisi
    switch (values.format) {
      case "mp3":
        cmd += "-x --audio-format mp3 ";
        break;
      case "mp4":
        cmd += "-f 'best[ext=mp4]' ";
        break;
      case "best":
        cmd += "-f best ";
        break;
    }

    // Dossier de destination
    if (values.destination) {
      cmd += `-o '${values.destination}/%(title)s.%(ext)s' `;
    } else {
      cmd += `-o '~/Downloads/%(title)s.%(ext)s' `;
    }

    // URL à télécharger
    cmd += `"${values.url}"`;

    // Toast de démarrage
    showToast({
      style: Toast.Style.Animated,
      title: "Téléchargement en cours...",
      message: "Traitement de la vidéo avec yt-dlp",
    });

    // Exécution de la commande avec environnement élargi
    exec(
      cmd,
      {
        env: {
          ...process.env,
          PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:${process.env.HOME}/.local/bin`,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Erreur exec: ${error}`);
          console.error(`stderr: ${stderr}`);
          showToast({
            style: Toast.Style.Failure,
            title: "Échec du téléchargement",
            message: "Vérifiez l'URL et votre connexion internet",
          });
        } else {
          showToast({
            style: Toast.Style.Success,
            title: "Téléchargement terminé !",
            message: "Le fichier a été sauvegardé avec succès",
          });

          // Fermer l'interface après succès
          setTimeout(() => {
            popToRoot();
            closeMainWindow();
          }, 1500);
        }
      },
    );
  }

  // Fonction pour obtenir l'icône et la couleur selon l'état de yt-dlp
  function getYtDlpStatus() {
    if (ytDlpOk === null) {
      return {
        text: "Vérification de yt-dlp...",
        icon: Icon.CircleProgress,
        iconColor: undefined,
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
            shortcut={{ modifiers: ["cmd"], key: "enter" }}
          />
          <Action
            title="Réinstaller yt-dlp"
            icon={Icon.Terminal}
            onAction={() => {
              showToast({
                style: Toast.Style.Animated,
                title: "Installation de yt-dlp",
                message: "Exécutez: brew install yt-dlp",
              });
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
        defaultValue={clipboardUrl}
        info="L'URL sera automatiquement détectée depuis votre presse-papier"
      />

      <Form.Dropdown id="format" title="Format de sortie" defaultValue="mp3">
        <Form.Dropdown.Item value="mp3" title="MP3 (audio seulement)" icon={Icon.Music} />
        <Form.Dropdown.Item value="mp4" title="MP4 (vidéo)" icon={Icon.Video} />
        <Form.Dropdown.Item value="best" title="Meilleure qualité (auto)" icon={Icon.Star} />
      </Form.Dropdown>

      <Form.TextField
        id="destination"
        title="Dossier de destination"
        placeholder="~/Downloads (par défaut)"
        info="Laissez vide pour utiliser le dossier Téléchargements"
      />
    </Form>
  );
}
