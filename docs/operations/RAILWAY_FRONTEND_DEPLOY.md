# Frontend deployment

The frontend Railway service is `BirrForex-Challenges-Bot`; its configured root is `WinnerPip/winnerpip`. The backend service is `web`.

On 2026-10-19, uploading the complete repository repeatedly timed out during code snapshot creation, before any build started. A frontend-only archive preserving its configured root uploaded successfully. Updating the CLI alone did not resolve the complete-repository upload failure.

Deploy committed frontend files only, from the repository root:

```sh
deploy_dir=$(mktemp -d /tmp/winnerpip-frontend.XXXXXX)
git archive HEAD WinnerPip/winnerpip | tar -x -C "$deploy_dir"
npx --yes @railway/cli@5.70.0 up "$deploy_dir" --path-as-root --service BirrForex-Challenges-Bot --detach
```

Check the returned deployment ID until its status is SUCCESS, then verify https://winnerpip.com/challenges. An upload timeout is not a build error; inspect deployment status before retrying. Failed historical attempts remain in Railway history even after a successful rollout. Do not restart the backend or database to repair a frontend upload failure.
