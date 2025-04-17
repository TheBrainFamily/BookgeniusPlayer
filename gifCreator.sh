    #!/bin/bash

    # --- Script to create a boomerang (forward + reverse) loop GIF ---
    # --- Includes --force option to overwrite original file       ---

    # --- Configuration ---
    # Default values
    INPUT_GIF=""
    FORCE_OVERWRITE=false
    OUTPUT_SUFFIX="_boomerang.gif" # Suffix used when not overwriting

    # --- Argument Parsing ---
    # Loop through all arguments passed to the script
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --force) FORCE_OVERWRITE=true; shift ;; # Set force flag and consume argument
            -*) echo "Unknown option: $1" >&2; exit 1 ;; # Handle unknown options
            *) # Assume it's the input file if not an option
               # Check if input file already set (prevent multiple inputs)
               if [ -n "$INPUT_GIF" ]; then
                   echo "Error: Only one input GIF file can be specified." >&2
                   exit 1
               fi
               INPUT_GIF="$1"; shift ;; # Set input file and consume argument
        esac
    done

    # --- Input Validation ---
    # Check if an input file was provided
    if [ -z "$INPUT_GIF" ]; then
        echo "Usage: $0 <input.gif> [--force]"
        echo "  <input.gif> : Path to the source GIF file."
        echo "  --force     : Overwrite the original input file with the result."
        exit 1
    fi

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
    EXTENSION="${INPUT_GIF##*.}" # File extension (e.g., gif)

    # Define the final output filename and a temporary processing filename
    if [ "$FORCE_OVERWRITE" = true ]; then
        # When forcing, the final target is the original file.
        # We need a temporary file during processing to avoid read/write conflicts.
        FINAL_OUTPUT_GIF="$INPUT_GIF"
        # Use /tmp for the temporary output file as well for consistency and safety
        TEMP_OUTPUT_GIF="/tmp/temp_boomerang_$(basename "$INPUT_GIF")_$$'.'$EXTENSION"
        echo "Mode: Overwrite original file (--force enabled)"
    else
        # When not forcing, output to a new file with suffix
        FINAL_OUTPUT_GIF="${BASE_NAME}${OUTPUT_SUFFIX}"
        TEMP_OUTPUT_GIF="$FINAL_OUTPUT_GIF" # Process directly into the final file (unless forcing)
         echo "Mode: Create new file (default)"
    fi

    # Define a temporary file name for the palette (using /tmp for better practice)
    # FIX: Removed extra single quotes around .png
    PALETTE_FILE="/tmp/palette_$(basename "$INPUT_GIF")_$$.png" # Add process ID

    # --- Processing ---
    echo "Input GIF: $INPUT_GIF"
    echo "Output Target: $FINAL_OUTPUT_GIF"
    echo "Temporary Palette: $PALETTE_FILE"
    # Only show TEMP_OUTPUT_GIF if it's different from FINAL_OUTPUT_GIF
    if [ "$FORCE_OVERWRITE" = true ]; then
        echo "Temporary Output: $TEMP_OUTPUT_GIF"
    fi

    echo "Step 1: Generating custom color palette..."

    # Pass 1: Generate the palette
    # Added -loglevel error to ffmpeg to reduce verbose output unless there's an error
    ffmpeg -loglevel error -i "$INPUT_GIF" \
           -vf "split[original][to_reverse]; [to_reverse]reverse[reversed]; [original][reversed]concat=n=2:v=1:a=0,palettegen=stats_mode=diff" \
           -y "$PALETTE_FILE"

    # Check if palette generation was successful
    if [ $? -ne 0 ]; then
        echo "Error: Failed to generate palette. Check ffmpeg output above if any." >&2
        rm -f "$PALETTE_FILE" # Clean up palette if it exists
        exit 1
    fi

    echo "Step 2: Creating the boomerang GIF using the palette..."

    # Pass 2: Create the final GIF using the generated palette
    # Output to TEMP_OUTPUT_GIF first. Use -loglevel error here too.
    ffmpeg -loglevel error -i "$INPUT_GIF" -i "$PALETTE_FILE" \
           -lavfi "split[original][to_reverse]; [to_reverse]reverse[reversed]; [original][reversed]concat=n=2:v=1:a=0[concatenated]; [concatenated][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
           -y "$TEMP_OUTPUT_GIF"

    # Check if GIF creation was successful
    gif_creation_status=$? # Store exit status

    # --- Cleanup Palette ---
    # Clean up the temporary palette file regardless of GIF success/failure
    echo "Cleaning up temporary palette file..."
    rm -f "$PALETTE_FILE"

    # --- Finalize Output ---
    if [ $gif_creation_status -ne 0 ]; then
        echo "Error: Failed to create the final GIF. Check ffmpeg output above if any." >&2
        # Clean up temporary output file if it exists and if we were using one
        if [ "$FORCE_OVERWRITE" = true ]; then
             # Check if TEMP_OUTPUT_GIF is not the same as FINAL_OUTPUT_GIF before removing
             if [ "$TEMP_OUTPUT_GIF" != "$FINAL_OUTPUT_GIF" ]; then
                 rm -f "$TEMP_OUTPUT_GIF"
             fi
        fi
        exit 1
    else
        # GIF creation was successful
        if [ "$FORCE_OVERWRITE" = true ]; then
            # If --force was used, move the temporary file to overwrite the original
            # Check if TEMP_OUTPUT_GIF is different from FINAL_OUTPUT_GIF before moving
             if [ "$TEMP_OUTPUT_GIF" != "$FINAL_OUTPUT_GIF" ]; then
                echo "Overwriting original file '$INPUT_GIF'..."
                mv -f "$TEMP_OUTPUT_GIF" "$FINAL_OUTPUT_GIF"
                if [ $? -ne 0 ]; then
                    echo "Error: Failed to move temporary file to overwrite original." >&2
                    # Attempt to clean up temp file if move failed
                    rm -f "$TEMP_OUTPUT_GIF"
                    exit 1
                fi
             fi
        fi
        echo "Successfully processed GIF."
        echo "Final output: $FINAL_OUTPUT_GIF"
    fi

    exit 0
    