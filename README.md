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
### Installation rapide

Dans un terminal, placez-vous à la racine du dépôt et installez les dépendances
Python. Ces commandes sont à exécuter dans PowerShell sous Windows, ou dans un
terminal sous Linux et macOS :

```text
python -m pip install -r signal-processing/requirements.txt
```

Si votre système utilise la commande `python3` (courant sous Linux/macOS),
remplacez `python` par `python3`. Pour éviter d'installer les dépendances dans
votre environnement Python global, vous pouvez créer un environnement virtuel :

```text
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r signal-processing/requirements.txt

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r signal-processing/requirements.txt
```

### Générer le rapport

Depuis la racine du dépôt, lancez le script (utilisez `python3` à la place de
`python` si nécessaire) :

```text
python signal-processing/filter_ecg.py --record 1
```

Le script génère les fichiers suivants dans `data/processed/` :

1. Le signal filtré au format JSON (`record-1-filtered.json`).
2. Le graphique comparatif des signaux brut et filtré (`record-1-comparison.png`).
3. Le rapport source au format LaTeX (`record-1-report.tex`).

Pour obtenir le PDF, créez un projet sur [Overleaf](https://www.overleaf.com/)
et téléversez-y le fichier `.tex` ainsi que l'image `.png` correspondante.
Overleaf compile le rapport en ligne. Cette approche garde le projet et son
architecture web 100 % statiques, sans nécessiter de compilateur LaTeX local.

Les paramètres du filtre restent configurables, par exemple
`--low 0.5 --high 40 --order 4`.

### Interface web statique

L'application web permet de sélectionner un enregistrement, de basculer entre
les signaux ECG brut et filtré et de télécharger un rapport LaTeX depuis le
panneau ECG. Le rapport est produit localement dans le navigateur à partir des
données JSON du record ; il contient son graphique et ses paramètres, sans
requérir de serveur dynamique. Le fichier `.tex` téléchargé peut être déposé
directement sur Overleaf pour obtenir le PDF.

## Lancement du projet
1. Cloner le dépôt sur votre machine.
2. Ouvrir le projet avec un éditeur (comme VS Code).
3. Lancer un serveur local depuis le dossier `web/` (par exemple avec l'extension Live Server de VS Code) afin de charger correctement les fichiers JSON.
