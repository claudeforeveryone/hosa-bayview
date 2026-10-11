# Browser checks for the installable app and push

Python Playwright (`pip install playwright`, then `playwright install chromium`). They run against a production
build, because the service worker only registers there:

```sh
npm run build && npx next start -p 3102
python scripts/e2e/pwa_shell.py   # manifest, icons, service worker, precache, offline page, what gets cached
python scripts/e2e/pwa_app.py     # install card, notifications ask, /notifications line (and that it moves
                                  # nothing), focus under the card, keyboard focus when turning on (each answer),
                                  # status bar colour (app pages and sign-in), Settings tabs and Phone app, blocked
                                  # then allowed (read again on return), short sessions
```

- `BASE_URL` (default `http://localhost:3102`) points them elsewhere. `SHOTS_DIR` saves screenshots there.
- Signed-in checks need a plain member test account: `QA_EMAIL` and `QA_PASSWORD`, or `QA_ENV_FILE` naming a file
  that holds them. Keep that file out of the repo. Without it, `pwa_shell.py` skips its signed-in part and
  `pwa_app.py` exits 2.
- Headless Chromium has no push service, so `pwa_app.py` stands in for it and answers the two push routes in the
  browser. It never writes to the database. Real delivery to a real phone can't be checked headless.
- Each prints one PASS/FAIL line per check and exits 1 if any failed. Every page waits for its stylesheet before
  anything is measured (`wait_for_styles`).
- Run them one at a time against one server: `pwa_app.py` signs the test account in twice.
