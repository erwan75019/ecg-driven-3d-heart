import json
from pathlib import Path


# Chemins construits depuis l'emplacement du script
project_root = Path(__file__).resolve().parent.parent
source_path = project_root / "data" / "ludb" / "data.json"
output_directory = project_root / "web" / "data" / "ludb"
records_directory = output_directory / "records"

# Lecture des 200 enregistrements LUDB
with source_path.open(encoding="utf-8") as source_file:
    records = json.load(source_file)

records_directory.mkdir(parents=True, exist_ok=True)
index = []

for record_id, record in enumerate(records, start=1):
    index.append({"id": record_id, "label": record["label"]})

    # Conservation exacte du signal et des annotations du fichier source
    web_record = {
        "label": record["label"],
        "fs": record["fs"],
        "ecg": record["ecg"],
        "intervals": record["intervals"],
    }

    record_path = records_directory / f"record-{record_id}.json"
    with record_path.open("w", encoding="utf-8") as record_file:
        json.dump(web_record, record_file, ensure_ascii=False, separators=(",", ":"))

index_path = output_directory / "index.json"
with index_path.open("w", encoding="utf-8") as index_file:
    json.dump(index, index_file, ensure_ascii=False, separators=(",", ":"))

print(f"{len(records)} enregistrements exportés dans {output_directory}")
