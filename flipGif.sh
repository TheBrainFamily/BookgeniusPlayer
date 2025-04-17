    #!/bin/bash

    # --- Script to flip a GIF horizontally (mirror image) ---

    # --- Input Validation ---
    # Check if an input file was provided
    if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <input.gif>"
        echo "  <input.gif> : Path to the source GIF file to flip."
        exit 1
    fi

    # Input file path from the first argument
    INPUT_GIF="$1"

    # Check if the input file exists
    if [ ! -f "$INPUT_GIF" ]; then
        echo "Error: Input file '$INPUT_GIF' not found." >&2
        exit 1
    fi

    # Check if ffmpeg command exists
    if ! command -v ffmpeg &> /dev/null; then
        echo "Error: ffmpeg command not found. Please install ffmpeg." >&2
        echo "On macOS with Homebrew, run: brew install ffmpeg" >&2
        exit 1
    fi

    # --- Define Filenames ---
    BASE_NAME="${INPUT_GIF%.*}" # Filename without extension
    OUTPUT_SUFFIX="_flipped.gif" # Suffix for the output file
    FINAL_OUTPUT_GIF="${BASE_NAME}${OUTPUT_SUFFIX}"
    # Define a temporary file name for the palette (using /tmp and process ID)
    # FIX: Removed extra single quotes around .png
    PALETTE_FILE="/tmp/palette_flip_$(basename "$INPUT_GIF")_$$.png"

    # --- Processing ---
    echo "Input GIF: $INPUT_GIF"
    echo "Output GIF: $FINAL_OUTPUT_GIF"
    echo "Temporary Palette: $PALETTE_FILE"

    echo "Step 1: Generating custom color palette for flipped GIF..."

    # Pass 1: Generate the palette based on the *flipped* video content
    # Apply hflip *before* palettegen
    # Added -loglevel error
    ffmpeg -loglevel error -i "$INPUT_GIF" \
           -vf "hflip,palettegen=stats_mode=diff" \
           -y "$PALETTE_FILE"

    # Check if palette generation was successful
    if [ $? -ne 0 ]; then
        echo "Error: Failed to generate palette. Check ffmpeg output above if any." >&2
        rm -f "$PALETTE_FILE" # Clean up palette if it exists
        exit 1
    fi

    echo "Step 2: Creating the flipped GIF using the palette..."

    # Pass 2: Create the final flipped GIF using the generated palette
    # Added -loglevel error
    ffmpeg -loglevel error -i "$INPUT_GIF" -i "$PALETTE_FILE" \
           -lavfi "[0:v]hflip[flipped]; [flipped][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
           -y "$FINAL_OUTPUT_GIF"

    # Check if GIF creation was successful
    gif_creation_status=$?

    # --- Cleanup Palette ---
    echo "Cleaning up temporary palette file..."
    rm -f "$PALETTE_FILE"

    # --- Finalize ---
    if [ $gif_creation_status -ne 0 ]; then
        echo "Error: Failed to create the flipped GIF. Check ffmpeg output above if any." >&2
        # Optional: remove partially created output file if it exists
        # rm -f "$FINAL_OUTPUT_GIF"
        exit 1
    else
        echo "Successfully created flipped GIF: $FINAL_OUTPUT_GIF"
    fi

    exit 0
    