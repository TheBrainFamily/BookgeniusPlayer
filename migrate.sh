#!/bin/bash

# Zatrzymaj skrypt, jeśli jakakolwiek komenda zwróci błąd
set -e

# --- Konfiguracja ---
# Pobierz docelowy folder z pierwszego argumentu skryptu
DEST_DIR=$1

# Sprawdź, czy podano argument
if [ -z "$DEST_DIR" ]; then
    echo "Błąd: Podaj folder docelowy jako argument."
    echo "Przykład użycia: ./migrate.sh apps/player"
    exit 1
fi

# Wyciągnij nadrzędny folder z docelowej ścieżki (np. 'apps' z 'apps/player')
# To jest kluczowe, aby uniknąć błędu "can not move directory into itself"
PARENT_DIR=$(echo "$DEST_DIR" | cut -d'/' -f1)

# --- Działanie ---
echo "Tworzenie folderu docelowego: $DEST_DIR"
mkdir -p "$DEST_DIR"

echo "Przenoszenie plików do $DEST_DIR..."

# Pętla przez wszystkie pliki i foldery w obecnym katalogu (włączając ukryte)
# ls -A pomija '.' i '..'
for item in $(ls); do
    # Sprawdź, czy element nie jest folderem .git ANI folderem nadrzędnym celu
    if [ "$item" != ".git" ] && [ "$item" != "$PARENT_DIR" ] && [ "$item" != "migrate.sh" ]; then
        echo " -> Przenoszę: $item"
        # Użyj git mv, aby przenieść element
        git mv "$item" "$DEST_DIR/"
    fi
done

echo "Przenoszenie zakończone pomyślnie."
