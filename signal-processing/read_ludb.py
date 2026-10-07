import json
from pathlib import Path


# Construction du chemin depuis l'emplacement de ce script
project_root = Path(__file__).resolve().parent.parent
data_path = project_root / "data" / "ludb" / "data.json"

# Chargement des enregistrements LUDB
with data_path.open(encoding="utf-8") as file:
    records = json.load(file)

# Lecture du premier enregistrement uniquement
record = records[0]
label = record["label"]
fs = record["fs"]
ecg = record["ecg"]
intervals = record["intervals"]

# Calcul du nombre d'échantillons et de la durée du signal
number_of_samples = len(ecg)
duration = number_of_samples / fs

# Affichage des informations principales
print(f"Record : {label}")
print(f"Sampling rate : {fs} Hz")
print(f"Nombre d'échantillons : {number_of_samples}")
print(f"Durée : {duration} s")
print(f"Nombre d'ondes P : {len(intervals['P'])}")
print(f"Nombre de QRS : {len(intervals['QRS'])}")
print(f"Nombre d'ondes T : {len(intervals['T'])}")
