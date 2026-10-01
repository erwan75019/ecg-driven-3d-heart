# ecg-driven-3d-heart
ECG-driven 3D heart visualization for cardiac cycle analysis and interactive web animation.

## Technologies utilisées
- Front-end / 3D : HTML5, CSS3, JavaScript (Modules ES6), Three.js (via importmaps)
- Traitement du signal (ECG) : Python, bibliothèque WFDB, Matplotlib
- Source des données : PhysioNet QT Database (enregistrement sel100, dérivation MLII à 250 Hz)

## Structure du projet
- index.html : Interface principale de l'application web.
- css/ : Feuilles de style de l'interface.
- js/ : Scripts de rendu 3D (Three.js) et de traçage du signal ECG 2D.
- models/ : Modèle anatomique 3D du cœur (Human_Heart.glb).
- docs/ : Génération automatique des graphiques ECG (Matplotlib).

## Lancement du projet
1. Cloner le dépôt sur votre machine.
2. Ouvrir le projet avec un éditeur (comme VS Code).
3. Lancer un serveur local (par exemple via l'extension Live Server sur VS Code) pour alimenter correctement les modules ES6 et le modèle 3D.