import wfdb
import matplotlib.pyplot as plt


# Lecture de l'enregistrement ECG
record = wfdb.rdrecord("data/raw/sel100")

# Informations sur l'enregistrement
print("Nombre de signaux :", record.n_sig)
print("Fréquence :", record.fs, "Hz")
print("Noms des signaux :", record.sig_name)
print("Nombre d'échantillons :", record.sig_len)

# Sélection du premier signal : MLII
ecg = record.p_signal[:, 0]

# On affiche seulement 5 secondes
duration = 5
samples = int(record.fs * duration)

# Création de l'axe du temps
time = [i / record.fs for i in range(samples)]

# Affichage
plt.plot(time, ecg[:samples])

plt.title("ECG sel100 - MLII")
plt.xlabel("Temps (s)")
plt.ylabel("Amplitude (mV)")
plt.grid()
plt.savefig(
    "docs/ecg_sel100_mlii.png",
    dpi=300,
    bbox_inches="tight"
)

plt.show()