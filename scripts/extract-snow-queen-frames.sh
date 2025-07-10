#!/bin/bash

# Script to extract first frame from MP4 files ending with "-listens" in Snow-Queen and create 200x200 PNG images

# Find all MP4 files ending with "-listens" in Snow-Queen directory
find public_books/Snow-Queen -name "*-listens.mp4" | while read -r mp4_file; do
    # Get the directory of the MP4 file
    dir=$(dirname "$mp4_file")
    
    # Extract the base name (remove path and extension)
    base_name=$(basename "$mp4_file" .mp4)
    
    # Remove "-listens" suffix to get the character name
    character_name=${base_name%-listens}
    
    # Create the output PNG filename
    png_file="$dir/${character_name}.png"
    
    echo "Processing: $mp4_file -> $png_file"
    
    # Extract first frame and resize to 200x200
    ffmpeg -i "$mp4_file" -vframes 1 -vf "scale=200:200:force_original_aspect_ratio=decrease,pad=200:200:(ow-iw)/2:(oh-ih)/2" -y "$png_file" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully created: $png_file"
    else
        echo "❌ Failed to create: $png_file"
    fi
done

echo "Snow-Queen frame extraction complete!" 