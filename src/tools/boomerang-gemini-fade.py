#!/usr/bin/env python3
import subprocess
import argparse
import sys
import math
import json

# --- run_command function remains the same ---
def run_command(command, capture=True):
    """Runs a command, optionally captures stdout, raises exception on error."""
    print(f"Running: {' '.join(command)}")
    try:
        process = subprocess.run(
            command,
            check=True,
            capture_output=capture,
            text=True,
            encoding='utf-8',
            )
        return process.stdout.strip() if capture else ""
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {' '.join(command)}", file=sys.stderr)
        print(f"Return code: {e.returncode}", file=sys.stderr)
        stderr_output = e.stderr.strip() if e.stderr else ""
        if stderr_output:
             print(f"Stderr: {stderr_output}", file=sys.stderr)
        elif hasattr(e, 'output') and e.output:
             print(f"Output: {e.output.strip()}", file=sys.stderr)
        raise
    except FileNotFoundError:
        print(f"Error: Command '{command[0]}' not found. Is ffmpeg/ffprobe in your PATH?", file=sys.stderr)
        raise

# --- MODIFIED FUNCTION ---
def get_video_info(ffprobe_path, filename):
    """Gets video stream & format info using ffprobe JSON output, forcing frame counting."""
    command = [
        ffprobe_path,
        "-v", "error",
        "-count_frames",
        "-select_streams", "v:0",
        # Ask for stream fields + format duration
        "-show_entries", "stream=nb_read_frames,r_frame_rate,avg_frame_rate,codec_name:format=duration",
        "-print_format", "json",
        filename
    ]
    output_data = {}
    print("Analyzing video (counting frames, getting duration - may take a moment)...")
    try:
        json_output = run_command(command, capture=True)
        data = json.loads(json_output)

        # --- Stream Info ---
        if not data.get('streams') or not isinstance(data['streams'], list) or len(data['streams']) == 0:
            print("Error: No video streams found in ffprobe JSON output.", file=sys.stderr)
            return None
        video_stream = data['streams'][0]

        frame_count_str = video_stream.get('nb_read_frames')
        if frame_count_str is None:
             print("Error: 'nb_read_frames' not found even after forcing frame count.", file=sys.stderr)
             return None
        try:
             output_data['frame_count'] = int(frame_count_str)
        except (ValueError, TypeError):
             print(f"Error: Invalid value for 'nb_read_frames': {frame_count_str}", file=sys.stderr)
             return None

        r_rate_str = video_stream.get('r_frame_rate')
        avg_rate_str = video_stream.get('avg_frame_rate')
        is_valid_rate = lambda rate: isinstance(rate, str) and '/' in rate and rate != "0/0"

        if is_valid_rate(r_rate_str):
            output_data['frame_rate'] = r_rate_str
        elif is_valid_rate(avg_rate_str):
            print(f"Warning: Using 'avg_frame_rate' ({avg_rate_str}) as fallback for invalid 'r_frame_rate' ({r_rate_str}).", file=sys.stderr)
            output_data['frame_rate'] = avg_rate_str
        else:
            print(f"Error: Valid frame rate not found. Found r: {r_rate_str}, avg: {avg_rate_str}", file=sys.stderr)
            return None

        # --- Format Info ---
        if not data.get('format') or not data['format'].get('duration'):
             print("Error: Could not determine video duration from format info.", file=sys.stderr)
             # Attempt calculation as fallback? duration = frame_count / frame_rate
             # Requires parsing frame_rate_str -> float. Let's error out for now for simplicity.
             return None
        try:
             output_data['duration'] = float(data['format']['duration'])
        except (ValueError, TypeError):
             print(f"Error: Invalid value for format duration: {data['format']['duration']}", file=sys.stderr)
             return None

        return output_data

    except json.JSONDecodeError:
        print("Error: Failed to decode JSON output from ffprobe.", file=sys.stderr)
        return None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    except Exception as e:
        print(f"An unexpected error occurred while getting video info: {e}", file=sys.stderr)
        return None

# --- main() function ---
def main():
    # --- Argument Parsing ---
    parser = argparse.ArgumentParser(description="Create a seamless, optionally slowed-down boomerang loop with crossfaded transition using ffmpeg.")
    # Input/Output
    parser.add_argument("-i", "--input", required=True, help="Input video file path.")
    parser.add_argument("-o", "--output", required=True, help="Output video file path.")
    # Encoding
    parser.add_argument("-c", "--codec", default="libx264", help="Video codec (default: libx264). If --hwaccel, overridden.")
    parser.add_argument("-q", "--crf", default="23", help="CRF for libx264/libx265 (default: 23). Ignored if --hwaccel.")
    parser.add_argument("-p", "--preset", default="medium", help="Encoding preset for libx264/libx265 (default: medium). Ignored if --hwaccel.")
    parser.add_argument("-b", "--bitrate", default="8M", help="Target video bitrate for hardware accel (default: 8M).")
    # Boomerang/Slowdown/Fade
    parser.add_argument("-s", "--slowdown", type=float, default=1.0, help="Slowdown factor (e.g., 1.5 for 1.5x longer). Default: 1.0")
    parser.add_argument("-f", "--fade", type=float, default=0.3, help="Crossfade duration in seconds at transition (default: 0.3). Set to 0 for no fade (hard cut).")
    parser.add_argument("-a", "--audio", action='store_true', help="Keep audio. If slowed/faded, tempo/fade applied.")
    # Acceleration/Paths
    parser.add_argument("--hwaccel", action='store_true', help="Use VideoToolbox hardware acceleration (macOS).")
    parser.add_argument("--ffprobe-path", default="ffprobe", help="Path to ffprobe executable.")
    parser.add_argument("--ffmpeg-path", default="ffmpeg", help="Path to ffmpeg executable.")

    args = parser.parse_args()

    # --- Validate Arguments ---
    if args.slowdown <= 0:
        print("Error: Slowdown factor must be positive.", file=sys.stderr)
        sys.exit(1)
    if args.fade < 0:
        print("Error: Fade duration cannot be negative.", file=sys.stderr)
        sys.exit(1)

    input_file = args.input
    output_file = args.output
    slowdown_factor = args.slowdown
    fade_duration = args.fade
    ffmpeg_path = args.ffmpeg_path
    ffprobe_path = args.ffprobe_path

    # --- Get Video Info ---
    print("Getting video information...")
    video_info = get_video_info(ffprobe_path, input_file)
    if video_info is None:
        print("Error: Failed to retrieve necessary video information.", file=sys.stderr)
        sys.exit(1)

    frame_count = video_info['frame_count']
    frame_rate_str = video_info['frame_rate']
    duration = video_info['duration']

    # Validate fade duration against video duration
    if fade_duration >= duration:
        print(f"Error: Fade duration ({fade_duration}s) cannot be >= video duration ({duration:.2f}s).", file=sys.stderr)
        sys.exit(1)
    # Also check fade against slowdown? If slowdown makes effective duration shorter? No, fade happens on original speed segments.

    print(f"Input File:    {input_file}")
    print(f"Output File:   {output_file}")
    print(f"Total Frames:  {frame_count}")
    print(f"Frame Rate:    {frame_rate_str}")
    print(f"Duration:      {duration:.2f}s")
    print(f"Slowdown:      {f'{slowdown_factor}x' if slowdown_factor != 1.0 else 'No'}")
    print(f"Fade:          {f'{fade_duration}s' if fade_duration > 0 else 'No'}")
    print(f"Audio:         {'Keep' if args.audio else 'Remove'}")
    print(f"HW Accel:      {'Enabled (VideoToolbox)' if args.hwaccel else 'Disabled'}")

    # --- Base ffmpeg command construction ---
    ffmpeg_cmd = [ffmpeg_path]
    if args.hwaccel:
        ffmpeg_cmd.extend(["-hwaccel", "videotoolbox"])
    ffmpeg_cmd.extend(["-i", input_file])
    ffmpeg_cmd.extend(["-pix_fmt", "yuv420p"])

    # --- Build Filter Complex ---
    filter_complex_parts = []
    last_video_stream = "[0:v]" # Start with original video stream

    # Part 1: Reverse Copy (if fading needed or audio kept)
    # We need the reversed stream for xfade/acrossfade
    filter_complex_parts.extend([
        f"[0:v]split=2[v_fwd_src][v_rev_src]", # Split for forward/reverse source
        f"[v_rev_src]reverse[v_reversed]"     # Create reversed video stream
    ])
    # Now we have [v_fwd_src] and [v_reversed]

    # Part 2: Join Forward and Reversed (Xfade or Concat)
    if fade_duration > 0:
        # Use xfade for smooth transition
        xfade_offset = duration - fade_duration
        filter_complex_parts.append(
            f"[v_fwd_src][v_reversed]xfade=transition=fade:duration={fade_duration}:offset={xfade_offset}[boomeranged_v]"
        )
        last_video_stream = "[boomeranged_v]"
        print(f"Applying {fade_duration}s video crossfade starting at {xfade_offset:.2f}s.")
    else:
        # No fade: Use previous trim+concat method for sharp boomerang
        # NOTE: This requires frame count again. Maybe simplify and just concat full?
        # For simplicity when fade=0, let's just concat full forward/reverse. User can trim manually if needed.
        # This might have the original slight pause at edges if fade=0.
        # Reverting to trim logic if fade=0 adds complexity back. Let's stick to simple concat here.
        print("Warning: fade=0 selected. Using simple concatenation, may have slight pause at edges.")
        filter_complex_parts.append(
             f"[v_fwd_src][v_reversed]concat=n=2:v=1:a=0[boomeranged_v]"
        )
        last_video_stream = "[boomeranged_v]"


    # Part 3: Slowdown/Interpolation (applied AFTER boomerang join)
    if slowdown_factor != 1.0:
        if slowdown_factor > 1.0:
            filter_complex_parts.append(
                f"{last_video_stream}setpts={slowdown_factor}*PTS,"
                f"minterpolate=fps={frame_rate_str}:mi_mode=mci:mc_mode=aobmc:vsbmc=1[final_v]"
            )
        else: # slowdown_factor < 1.0 (Speedup)
             filter_complex_parts.append(
                f"{last_video_stream}setpts={slowdown_factor}*PTS[final_v]"
             )
             print("Warning: Speeding up video (slowdown < 1.0). Frame interpolation not applied.", file=sys.stderr)
        last_video_stream = "[final_v]"
    else:
        # If no slowdown, the output of boomerang is the final video stream label
        filter_complex_parts.append(f"{last_video_stream}copy[final_v]") # Use copy filter just to rename the stream label consistently
        last_video_stream = "[final_v]"


    # Part 4: Audio Handling
    audio_option = ["-an"]
    output_mapping = ["-map", last_video_stream] # Start with final video stream mapping

    if args.audio:
        audio_option = [] # Keep audio
        # Create reversed audio copy
        filter_complex_parts.extend([
            f"[0:a]asplit=2[a_fwd_src][a_rev_src]",
            f"[a_rev_src]areverse[a_reversed]"
        ])
        # Now have [a_fwd_src] and [a_reversed]

        # Join audio (Acrossfade or Concat)
        if fade_duration > 0:
            # Use acrossfade
            # acrossfade uses duration directly, assumes offset is duration-fade_duration implicitly
            filter_complex_parts.append(
                f"[a_fwd_src][a_reversed]acrossfade=d={fade_duration}:o=1:c1=tri:c2=tri[boomeranged_a]" # d=duration, o=overlap, c1/c2=curves
            )
            last_audio_stream = "[boomeranged_a]"
            print(f"Applying {fade_duration}s audio crossfade.")
        else:
            # No fade: simple concat
             filter_complex_parts.append(
                f"[a_fwd_src][a_reversed]concat=n=2:v=0:a=1[boomeranged_a]"
             )
             last_audio_stream = "[boomeranged_a]"

        # Apply tempo adjustment AFTER audio join
        if slowdown_factor != 1.0:
            audio_tempo = 1.0 / slowdown_factor
            if 0.5 <= audio_tempo <= 100.0:
                 filter_complex_parts.append(
                     f"{last_audio_stream}atempo={audio_tempo}[final_a]"
                 )
            else:
                 # Tempo out of range, chain filters
                 print(f"Warning: Required audio tempo {audio_tempo:.3f} outside atempo range (0.5-100.0). Chaining.", file=sys.stderr)
                 temp_stream = last_audio_stream
                 final_tempo = audio_tempo
                 chain_filters = []
                 while final_tempo < 0.5: chain_filters.append("atempo=0.5"); final_tempo /= 0.5
                 while final_tempo > 100.0: chain_filters.append("atempo=100.0"); final_tempo /= 100.0
                 if 0.5 <= final_tempo <= 100.0 and final_tempo != 1.0 : chain_filters.append(f"atempo={final_tempo}")
                 if chain_filters: filter_complex_parts.append(f"{temp_stream}{','.join(chain_filters)}[final_a]")
                 else: filter_complex_parts.append(f"{temp_stream}acopy[final_a]") # If no change needed, just copy label
            last_audio_stream = "[final_a]"
        else:
            # If no slowdown, the output of audio boomerang is the final audio stream label
            filter_complex_parts.append(f"{last_audio_stream}acopy[final_a]") # Use acopy filter just to rename the stream label consistently
            last_audio_stream = "[final_a]"

        output_mapping.extend(["-map", last_audio_stream]) # Map the final audio stream


    # Combine filter parts
    filter_complex = "; ".join(filter_complex_parts) # Use semicolon and space for readability
    ffmpeg_cmd.extend(["-filter_complex", filter_complex])

    # Add output mapping
    ffmpeg_cmd.extend(output_mapping)

    # Add audio options (e.g., -an or audio codec)
    ffmpeg_cmd.extend(audio_option)

    # Video encoding options
    if args.hwaccel:
        print(f"Using HW Encoder: h264_videotoolbox, Target Bitrate: {args.bitrate}")
        ffmpeg_cmd.extend(["-c:v", "h264_videotoolbox", "-b:v", args.bitrate])
        ffmpeg_cmd.extend(["-allow_sw", "1"])
    else:
        print(f"Using SW Encoder: {args.codec}, CRF: {args.crf}, Preset: {args.preset}")
        ffmpeg_cmd.extend(["-c:v", args.codec, "-crf", args.crf, "-preset", args.preset])

    # Add output file and overwrite flag
    ffmpeg_cmd.extend(["-y", output_file])

    # --- Run ffmpeg ---
    print("Running ffmpeg...")
    try:
        run_command(ffmpeg_cmd, capture=False)
        print(f"\nSuccessfully created boomerang loop: {output_file}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error during ffmpeg processing.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
