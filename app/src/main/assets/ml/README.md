# MediaPipe Hand Landmarker model

This directory must contain the official MediaPipe Hand Landmarker model with
the **`.task`** extension:

    app/src/main/assets/ml/hand_landmarker.task

> ⚠️ The file MUST be named `hand_landmarker.task` — **not** `hand_landmarker.txt`.
> If you received a copy whose extension was renamed to `.txt` (some file hosts
> reject `.task` uploads), either rename it back manually or run the bundled
> Gradle task, which does the rename for you:

    ./gradlew downloadHandLandmarker

The task also downloads the official model automatically when it is missing:

    https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

(~8 MB, MediaPipe Hand Landmarker, float16.)

If the file is absent at runtime the hand-tracking experience will show an
explicit "model missing" message instead of crashing.
