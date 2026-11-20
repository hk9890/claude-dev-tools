# Record a feature

The video shows the user the feature working before they open the page.

1. **Plan the flow.** Write down the steps that show the feature, and for each step the check that proves it worked: a text or element that `find` must return, and no new console error.
2. **Start the recording** on a fixed frame, with a callout on each action:

   ```bash
   cd <scratch> && playwright-cli -s=<session> resize 1280 720
   cd <scratch> && playwright-cli -s=<session> video-start <scratch>/<feature>-<yyyymmdd-hhmm>.webm --size=1280x720 --cursor
   cd <scratch> && playwright-cli -s=<session> video-show-actions
   ```

   `<feature>` is a short slug of the feature, `<yyyymmdd-hhmm>` the time now. Print the full path: it is `<video>` in the steps below.
3. **Drive each step.** Before a step, `video-chapter "<step>"`. After it, run its check.
4. **On a failed check**, run `video-stop`, delete `<video>`, and do not deliver it: a video of a flow that failed shows nothing true. Fix the feature and record again, or report the failure.
5. **Stop the recording** with `video-stop`. Then `test -s <video>` must pass. An empty or missing file means the ffmpeg build of playwright-cli is not installed: tell the user to run `playwright-cli install-browser ffmpeg`.
6. **Deliver the video.** Where the project's docs or the user name a place to keep demos, copy it there. Where `SendUserFile` is in the session's tools, or is a deferred tool (load it with ToolSearch `select:SendUserFile`), send `<video>` with it. In all cases, give the absolute path in your report.
