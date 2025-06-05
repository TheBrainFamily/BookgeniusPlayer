FILE_NAME="background-sara-slow-motion-loop.mp4"
# Duration (seconds) – we’ll reuse it for the xfade offset
DUR=$(ffprobe -v error -show_entries format=duration \
              -of default=noprint_wrappers=1:nokey=1 $FILE_NAME)

# Extract the source frame‑rate so we feed xfade the same fps on both legs
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
              -of csv=p=0 $FILE_NAME | bc -l)

# Forward branch, reverse branch (both forced to constant FPS) + 1‑s cross‑fade
ffmpeg -i $FILE_NAME \
  -filter_complex "[0:v]trim=0:${DUR},setpts=PTS-STARTPTS,fps=${FPS}[fwd]; \
                   [0:v]trim=0:${DUR},reverse,setpts=PTS-STARTPTS,fps=${FPS}[rev]; \
                   [fwd][rev]xfade=transition=fade:duration=1:offset=$(echo "$DUR-1" | bc),format=yuv420p[v]" \
  -map '[v]' -movflags +faststart "${FILE_NAME%.*}-fade.mp4"
  


FILE_NAME="background-army-slow-motion-loop.mp4"

ffmpeg -i $FILE_NAME -c:v libx264 -preset slow -crf 27 -maxrate 3M -bufsize 6M -pix_fmt yuv420p -movflags +faststart -an "${FILE_NAME%.*}-bg.mp4" 