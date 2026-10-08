# ecg-driven-3d-heart
ECG-driven 3D heart visualization for cardiac cycle analysis and interactive web animation.

## Technologies utilisées
- Front-end : HTML5, CSS3, JavaScript et Canvas 2D
- Traitement et export des signaux ECG : Python et JSON
- Source des données : Lobachevsky University Electrocardiography Database (LUDB), via PhysioNet
- Ressource 3D : modèle anatomique `Human_Heart.glb`, conservé pour une future intégration Three.js

## Structure du projet
- `web/index.html` : interface principale de l'application web.
- `web/css/` : feuilles de style de l'interface.
- `web/js/` : lecture des données LUDB, animation et tracé du signal ECG 2D.
- `web/data/ludb/` : index et 200 enregistrements optimisés pour la lecture web.
- `web/models/` : modèle anatomique 3D du cœur (`Human_Heart.glb`).
- `signal-processing/` : scripts de lecture et d'export des données LUDB.

## Filtrage ECG et rapport
Depuis la racine du projet, après installation des dépendances de
`signal-processing/requirements.txt` :

```powershell
python .\signal-processing\filter_ecg.py --record 1
```

Le script enregistre le signal filtré, le graphique comparatif et un rapport
LaTeX dans `data/processed/`. Pour générer également le PDF avec
[Tectonic](https://tectonic-typesetting.github.io/) (compilateur léger, à
installer séparément) :

```powershell
python .\signal-processing\filter_ecg.py --record 1 --compile-pdf
```

Si `pdflatex` est déjà installé, il peut être utilisé à la place :

```powershell
python .\signal-processing\filter_ecg.py --record 1 --compile-pdf --latex-engine pdflatex
```

Pour installer Tectonic sous Windows, téléchargez l'archive x86_64 MSVC
depuis la [page des dernières versions](https://github.com/tectonic-typesetting/tectonic/releases/latest),
extrayez `tectonic.exe` dans `%LOCALAPPDATA%\Programs\Tectonic`, puis
relancez PowerShell. Le script détecte automatiquement ce chemin, même s'il
n'est pas dans `PATH`.

Les paramètres restent configurables, par exemple
`--low 0.5 --high 40 --order 4`.

## Lancement du projet
1. Cloner le dépôt sur votre machine.
2. Ouvrir le projet avec un éditeur (comme VS Code).
3. Lancer un serveur local depuis le dossier `web/` (par exemple avec l'extension Live Server de VS Code) afin de charger correctement les fichiers JSON.
