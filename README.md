# ecg-driven-3d-heart
ECG-driven 3D heart visualization for cardiac cycle analysis and interactive web animation.

## Lancement du projet

1. Cloner le dépôt sur votre machine.
2. Ouvrir le projet avec un éditeur (comme VS Code).
3. Lancer un serveur local depuis le dossier `web/` (par exemple avec l'extension Live Server de VS Code) afin de charger correctement les fichiers JSON.

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

Les huit modèles disponibles dans le menu sont regroupés par vue. Le nom affiché
dans l'interface est suivi du titre original Sketchfab, du créateur et de la
licence. Chaque fichier GLB correspondant se trouve dans
`web/assets/models/`.

### Anatomie générale et vue externe

- **Modèle 3D externe (Rendu surfacique épuré)** — “Animated Beating Heart”,
  par [nitwit.friends](https://sketchfab.com/nitwit.friends). [Source
  Sketchfab](https://sketchfab.com/3d-models/animated-beating-heart-335cd677c2014ca19e89efd65c7ddc55)
  · fichier `animated-beating-heart.glb` ·
  [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
- **Modèle 3D anatomique animé (vue générale)** — “heart”, par
  [shooogp](https://sketchfab.com/shooogp). [Source
  Sketchfab](https://sketchfab.com/3d-models/heart-0bf594670b6a45db802b57d531e490a6)
  · fichier `anatomical-heart.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Modèle 3D anatomique fermé (vue externe)** — “Closed Heart”, par
  [Ali.Zorays](https://sketchfab.com/Ali.Zorays). [Source
  Sketchfab](https://sketchfab.com/3d-models/closed-heart-b995082afacf4498bc22048061b04390)
  · fichier `closed-heart.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Modèle 3D anatomique humain animé (texturé)** — “Human Heart.”, par
  [Ricardo Joel Arana](https://sketchfab.com/Ricardo47291). [Source
  Sketchfab](https://sketchfab.com/3d-models/human-heart-d0c176d08c884d5d8a4657c200a0c9bf)
  · fichier `human-heart-animated.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Modèle 3D cardiaque réaliste animé** — “Realistic Heart Animated”, par
  [Pixio x AI Tutor](https://sketchfab.com/tsiorg). [Source
  Sketchfab](https://sketchfab.com/3d-models/realistic-heart-animated-913988af9ae74d40aacd95927dc0936f)
  · fichier `realistic-heart-animated.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

### Vues internes et pathologies

- **Modèle 3D morphologique (Vue interne / Coupe)** — “Beating heart 3D”,
  par [soufiane oujihi](https://sketchfab.com/soufianeoujihi). [Source
  Sketchfab](https://sketchfab.com/3d-models/beating-heart-3d-85d48e7526dd4e73aaf2f22f22f169db)
  · fichier `beating-heart-3d.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Modèle 3D anatomique ouvert (vue interne)** — “Open Heart”, par
  [Ali.Zorays](https://sketchfab.com/Ali.Zorays). [Source
  Sketchfab](https://sketchfab.com/3d-models/open-heart-2819aadc83c54011bfb9cfd972fe1c87)
  · fichier `open-heart.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Modèle 3D pathologique (sténose mitrale)** — “Heart Mitral Stenosis”,
  par [Edwin3dArtist](https://sketchfab.com/edwinaldanadesign). [Source
  Sketchfab](https://sketchfab.com/3d-models/heart-mitral-stenosis-76b535535e054dc4a1b9ef64794428f2)
  · fichier `mitral-stenosis-heart.glb` · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Les modèles ont été récupérés depuis Sketchfab et leurs fiches indiquent une
licence CC BY 4.0. Pour les redistribuer, conserver l'attribution au créateur,
le lien vers la source et les conditions de cette licence. Les crédits et les
liens sont également accessibles dans l'onglet « Credits » du guide du site.

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
Pour tous les modèles, les limites annotées des intervalles QRS, T et P servent
aussi de repères pour répartir le clip d'animation au cours du cycle.
Chaque modèle possède un profil de cycle propre pour compenser le décalage et
le nombre de battements présents dans son clip ; le repère de contraction a
été estimé en échantillonnant le mouvement de chaque modèle. Ce calage reste
illustratif : les correspondances de poses n'ont pas fait l'objet d'une
validation physiologique.
L'amplitude de chaque complexe QRS, mesurée sur le signal ECG filtré par
rapport à une ligne de base locale, module également la force visuelle de
l'animation. Un battement est considéré actif lorsque son excursion robuste
(quantile 95 %) dépasse trois fois l'échelle de bruit robuste locale
(`1,4826 × MAD` de la ligne de base). Si la MAD s'annule sur une ligne de base
quantifiée mais non constante, le quantile 95 % des excursions de cette ligne
de base sert de repli. Les battements actifs utilisent un poids compris entre
0,35 et 1 ; en l'absence d'activité QRS valide, le modèle reste dans sa pose de
référence avec un poids nul. Une métadonnée d'amplitude absente ou invalide donne également un poids nul. Cette modulation est
uniquement éducative : l'amplitude ECG ne mesure pas directement la
contractilité mécanique cardiaque.
Le bouton « User guide » présente les commandes du site et le format attendu
pour ajouter des enregistrements.

Les nouveaux signaux doivent être convertis au format JSON utilisé dans
`web/data/ludb/records/` (`label`, `fs`, `ecg` et `intervals`), puis ajoutés à
`web/data/ludb/index.json`. Les annotations P, QRS et T sont des paires de
temps en secondes. Le filtre actuel nécessite une fréquence d'échantillonnage
supérieure à 80 Hz et plus de 27 échantillons par enregistrement.
`signal-processing/export_ludb_for_web.py` exporte la source LUDB du projet ;
il ne convertit pas automatiquement d'autres formats de données.

### Convertir un ECG CSV externe

Le script `signal-processing/convert_ecg_csv.py` convertit un CSV mono-canal en
un enregistrement JSON compatible avec le site. Il utilise uniquement la
bibliothèque standard Python ; aucun paquet supplémentaire n'est requis pour
cette conversion. Il prend en charge le CSV ; WFDB n'est pas ajouté comme
dépendance au projet.

Le CSV doit contenir un échantillon numérique par ligne dans la colonne
sélectionnée. Par défaut, la première colonne est utilisée. Avec un en-tête,
indiquez `--skip-header`; `--column` sélectionne une colonne par indice, à
partir de zéro. La fréquence `--fs` est obligatoire et doit être supérieure à
80 Hz pour le filtre actuel du site.

Exemple PowerShell, depuis la racine du dépôt. Ici, `201` est un nouvel
identifiant après les 200 enregistrements LUDB existants :

```text
python signal-processing/convert_ecg_csv.py recordings/patient-01.csv web/data/ludb/records/record-201.json --fs 500 --label "Patient 01" --column 1 --skip-header
```

The output contains `label`, `fs`, the original raw `ecg` samples and
`intervals`. By default, P/QRS/T annotations remain empty. To preserve existing
annotations, pass `--annotations`:

```text
python signal-processing/convert_ecg_csv.py recordings/patient-01.csv web/data/ludb/records/record-201.json --fs 500 --column 1 --skip-header --annotations recordings/patient-01-annotations.json
```

To estimate QRS annotations instead, use `--detect-qrs`:

```text
python signal-processing/convert_ecg_csv.py recordings/patient-01.csv web/data/ludb/records/record-201.json --fs 500 --column 1 --skip-header --detect-qrs
```

`--detect-qrs` and `--annotations` cannot be combined. The detector in
`signal-processing/qrs_detection.py` is an offline adaptation of
[Pan and Tompkins (1985)](https://doi.org/10.1109/TBME.1985.325532): 5-15 Hz
filtering, differentiation, squaring, 150 ms integration, adaptive signal/noise
thresholds, a 200 ms refractory period, T-wave discrimination and RR searchback.
Floating-point filters and centered integration replace the original 200 Hz
integer filters. It is not a bit-for-bit implementation of the original.
The exported `detection` metadata records the method and detected R-peak times.
QRS bounds are estimated windows from 60 ms before to 80 ms after each peak;
P and T intervals remain empty. Review the estimates: weak, noisy or atypical
beats may be missed or falsely detected. This is not clinical validation.

Exemple de contenu pour `patient-01-annotations.json` (les temps sont en
secondes) :

```json
{
  "P": [[0.10, 0.18]],
  "QRS": [[0.20, 0.28]],
  "T": [[0.35, 0.50]]
}
```

Les intervalles doivent être des paires de temps en secondes comprises dans la
durée du signal. Le script ne remplace pas un fichier de sortie existant sans
l'option `--overwrite`. Pour que le site statique affiche l'enregistrement,
conservez le nom `record-ID.json`, choisissez un identifiant unique, puis
inscrivez cet identifiant et son libellé dans `web/data/ludb/index.json`. Le
script ne modifie pas l'index. N'utilisez pas ces exemples avec des données
identifiantes sans vérifier les règles de confidentialité applicables.

### Local browser import and viewer controls

Use **Import ECG** to select a CSV or a JSON record. Processing stays in the
browser: there is no upload, backend or change to the repository's data index.
Imported records remain selectable with previous/next navigation for the
current page session only. Reloading removes them.
For CSV, enter the sampling rate from the source (no rate is assumed).
The preview shows table dimensions; one selected column is read top to bottom
as consecutive samples. If rows are separate recordings, export one recording
as a single column first. Open **CSV settings** to change the signal column
(the UI starts at **1**; the Python CLI starts at **0**), separator and header.
The browser accepts up to **10 MB**, **100,000 samples**, and **80 < fs <= 10,000 Hz**.
The signal panel displays **Local ECG** for the selected import. CSV loads
estimate P, QRS and T from signal samples. JSON keeps supplied non-empty QRS
and any explicit P/T arrays, including empty arrays. Missing or empty QRS
and omitted P/T keys can be estimated. See the
[P/T detection method, LUDB evaluation and limits](docs/pt-detection-evaluation.md).
The imported plot fits the raw and filtered signals;
bundled records keep at least the usual [-1.2, 1.2] vertical range, expanding
it when needed to show all raw and filtered samples.

The transport bar keeps separate **Restart**, **Play** and **Pause** buttons on one row. **More options**
reveals playback speed, filtered/raw ECG, the report and the user guide.
The ECG plot keeps a bounded height independently of the 3D viewer.

The model-size slider runs from **0.5x to 4x**. The heart remains at its
scene position: camera input does not change its position or rotation.
**Orbit around heart** moves the camera around the model. **Free camera** looks
independently from its current position: drag to turn the view, right-drag
to pan, and scroll to move forward/back. On touch devices, one finger looks
around and two fingers pan/pinch. Focus the viewer for W/S forward/back,
A/D sideways and Q/E down/up. **Reset view** returns the camera to the heart.
A world-space reference floor makes the camera movement visible.

Run the focused checks without installing additional test dependencies:

```text
node --test tests/*.test.cjs
python -B -m unittest discover -s signal-processing -p "test_*.py" -v
```

Le site peut être hébergé sur un service statique comme GitHub Pages. Le
chargement de Three.js depuis un CDN nécessite une connexion internet pour la
visualisation 3D ; les enregistrements et le modèle du cœur sont dans le dépôt.
