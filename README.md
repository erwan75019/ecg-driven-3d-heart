# ecg-driven-3d-heart
ECG-driven 3D heart visualization for cardiac cycle analysis and interactive web animation.

## Technologies utilisées
- Front-end : HTML5, CSS3, JavaScript et Canvas 2D
- Traitement et export des signaux ECG : Python et JSON
- Source des données : Lobachevsky University Electrocardiography Database (LUDB), via PhysioNet
- Ressources 3D : modèles sélectionnables chargés avec Three.js.

## Structure du projet
- `web/index.html` : interface principale de l'application web.
- `web/css/` : feuilles de style de l'interface.
- `web/js/` : lecture des données LUDB, animation et tracé du signal ECG 2D.
- `web/data/ludb/` : index et 200 enregistrements optimisés pour la lecture web.
- `web/assets/models/` : modèles 3D du cœur sélectionnables dans l'interface.
- `signal-processing/` : scripts de lecture et d'export des données LUDB.

## Modèles 3D et crédits

- **“Beating heart 3D”**, par soufiane oujihi. [Sketchfab](https://sketchfab.com/3d-models/beating-heart-3d-85d48e7526dd4e73aaf2f22f22f169db) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **“Animated Beating Heart”**, par nitwit.friends. [Sketchfab](https://sketchfab.com/3d-models/animated-beating-heart-335cd677c2014ca19e89efd65c7ddc55) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **“heart”**, par shooogp. [Sketchfab](https://sketchfab.com/3d-models/heart-0bf594670b6a45db802b57d531e490a6) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **“Heart Mitral Stenosis”**, par Edwin3dArtist. [Sketchfab](https://sketchfab.com/3d-models/heart-mitral-stenosis-76b535535e054dc4a1b9ef64794428f2) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **“Closed Heart” et “Open Heart”**, par Ali.Zorays. [Closed model](https://sketchfab.com/3d-models/closed-heart-b995082afacf4498bc22048061b04390) · [Open model](https://sketchfab.com/3d-models/open-heart-2819aadc83c54011bfb9cfd972fe1c87) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **“Human Heart.”**, par Ricardo Joel Arana. [Sketchfab](https://sketchfab.com/3d-models/human-heart-d0c176d08c884d5d8a4657c200a0c9bf) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **“Realistic Heart Animated”**, par Pixio x AI Tutor. [Sketchfab](https://sketchfab.com/3d-models/realistic-heart-animated-913988af9ae74d40aacd95927dc0936f) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Les huit modèles sont sélectionnables dans le menu, regroupés par type de vue.
Les crédits complets et les liens vers les licences sont également accessibles
depuis l'onglet « Credits » du guide d'utilisation. Tous les modèles retenus
sont téléchargeables et publiés sous CC BY 4.0.

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

### Filtrer un enregistrement

Depuis la racine du dépôt, lancez le script (utilisez `python3` à la place de
`python` si nécessaire) :

```text
python signal-processing/filter_ecg.py --record 1
```

Le script génère les fichiers suivants dans `data/processed/` :

1. Le signal filtré au format JSON (`record-1-filtered.json`).
2. Le graphique comparatif des signaux brut et filtré (`record-1-comparison.png`).

Les paramètres du filtre restent configurables, par exemple
`--low 0.5 --high 40 --order 4`.

### Interface web statique

L'application web permet de sélectionner un enregistrement, de basculer entre
les signaux ECG brut et filtré et d'ouvrir un aperçu du rapport dans la page.
Les zones P, QRS et T du graphique correspondent aux annotations de
l'enregistrement sélectionné. Le signal filtré et le rapport sont calculés dans
le navigateur à partir des données JSON locales ; aucun serveur applicatif ni
base de données n'est nécessaire. L'aperçu du rapport s'affiche directement
dans la page et peut être imprimé ou enregistré en PDF depuis le navigateur.
Le rapport comprend également, pour chaque onde P annotée, le délai entre son
début et le pic maximal du complexe QRS suivant dans le signal ECG filtré. Un
clic ou un glissement sur le tracé ECG positionne le curseur à cet instant et
synchronise le cœur sans démarrer la lecture.
Le bouton « User guide » présente les commandes du site et le format attendu
pour ajouter des enregistrements.

Les nouveaux signaux doivent être convertis au format JSON utilisé dans
`web/data/ludb/records/` (`label`, `fs`, `ecg` et `intervals`), puis ajoutés à
`web/data/ludb/index.json`. Les annotations P, QRS et T sont des paires de
temps en secondes. Le filtre actuel nécessite une fréquence d'échantillonnage
supérieure à 80 Hz et plus de 27 échantillons par enregistrement.
`signal-processing/export_ludb_for_web.py` exporte la source LUDB du projet ;
il ne convertit pas automatiquement d'autres formats de données.

Le site peut être hébergé sur un service statique comme GitHub Pages. Le
chargement de Three.js depuis un CDN nécessite une connexion internet pour la
visualisation 3D ; les enregistrements et le modèle du cœur sont dans le dépôt.

## Lancement du projet
1. Cloner le dépôt sur votre machine.
2. Ouvrir le projet avec un éditeur (comme VS Code).
3. Lancer un serveur local depuis le dossier `web/` (par exemple avec l'extension Live Server de VS Code) afin de charger correctement les fichiers JSON.
