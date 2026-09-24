# Registering model providers

The default routes are ChatGPT (`openai-codex`), Claude (`claude-bridge`) and Gemini (`gemini-cli-acp`). `chatgpt` is the user-facing command; `gpt` remains a compatibility alias. Provider and model IDs are not renamed, so saved sessions remain valid.

Run `ph providers catalog` to see the built-in provider IDs supported by the pinned Pi version. Registering a route enables its available model catalog; account entitlements still determine which requests succeed. This supports Pi providers and compatible endpoints, not every proprietary web app or undocumented model protocol.

## API accounts

```sh
ph providers add openrouter --allow-paid-api
ph login openrouter
```

Use Pi's `/login openrouter` prompt to store your API credential privately. Restart the harness, then `/switch openrouter`. The picker/footer identifies API routes. Registration persists your explicit opt-in; there is no automatic subscription-to-API fallback.

Other built-in IDs from `ph providers catalog` use the same commands. Cloud providers may require additional provider-scoped credential configuration supported by Pi; do not put credentials into project files.

## Additional subscription OAuth

For a built-in provider that supports your subscription through OAuth:

```sh
ph providers add PROVIDER_ID --subscription --extra-usage-off
ph login PROVIDER_ID
```

First check account entitlement and extra-usage settings. Choose OAuth during login. API-key credentials are rejected for a route marked subscription. A provider's presence in Pi is not evidence that an arbitrary web subscription works with it.

## Local model servers

Adapt [ollama.json](../examples/providers/ollama.json) with the actual model ID and context limits configured on your server, then:

```sh
ph providers add /path/to/ollama.json
```

Start Ollama, LM Studio, vLLM or another compatible server yourself. The installer does not download model weights or start an inference server. Local routes must use loopback addresses. In WSL, `127.0.0.1` refers to the WSL networking environment; the easiest arrangement is to run the server inside the same distribution. A server on the Windows host requires appropriate networking and a deliberately registered endpoint.

The dummy local key is only a protocol placeholder. A reverse proxy listening on localhost could still forward to a paid service; the harness cannot inspect what that server does.

## Compatible hosted endpoints

Adapt [compatible-api.json](../examples/providers/compatible-api.json), then register it with `--allow-paid-api`. Supported endpoint protocols are `openai-completions`, `openai-responses`, `anthropic-messages` and `google-generative-ai`. Correct model IDs, endpoint compatibility and tool support remain the server's responsibility.

Use `ph login PROVIDER_ID` to store credentials or the explicitly named `PH_MODEL_*` variable in your endpoint configuration. Plain API keys, credential commands and arbitrary headers are not accepted in provider-registration JSON. Existing OpenAI/Anthropic/Google API environment variables remain stripped so adding an API account cannot change the default subscription workers' authentication.

The private registry lives at `config/providers.json` inside the harness data directory. The launcher generates Pi's private `models.json` from it. Project-level model/engine overrides remain blocked. Direct edits to the private registry are treated as user configuration; this is not an OS sandbox against processes running as the same user.

Remove an additional route with `ph providers remove ID`. This removes its local credential; it does not revoke tokens at the provider. Finish the current turn and restart after changing provider configuration. Handoffs, instructions, checkpoint approval and managed review restrictions apply to additional workers too.
