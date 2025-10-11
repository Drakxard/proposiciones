# Propositions App

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/moradozard-3611s-projects/v0-propositions-app)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/cmIQDm7WyJZ)

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/moradozard-3611s-projects/v0-propositions-app](https://vercel.com/moradozard-3611s-projects/v0-propositions-app)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/cmIQDm7WyJZ](https://v0.app/chat/projects/cmIQDm7WyJZ)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Configuración recomendada de modelos Groq

Si deseas utilizar la aplicación junto a la API de Groq, estos son los parámetros sugeridos para los modelos con los que se ha probado la generación de proposiciones:

### Modelo `openai/gpt-oss-120b`

```python
from groq import Groq

client = Groq()
completion = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[
      {"role": "user", "content": "hola"},
      {"role": "assistant", "content": "¡Hola! ¿En qué puedo ayudarte hoy?"},
      {"role": "user", "content": ""}
    ],
    temperature=1,
    max_completion_tokens=8192,
    top_p=1,
    reasoning_effort="medium",
    stream=True,
)

for chunk in completion:
    print(chunk.choices[0].delta.content or "", end="")
```

### Modelo `qwen/qwen3-32b`

```python
from groq import Groq

client = Groq()
completion = client.chat.completions.create(
    model="qwen/qwen3-32b",
    messages=[
      {"role": "user", "content": "hola"},
      {"role": "assistant", "content": "¡Hola! ¿En qué puedo ayudarte hoy?"},
      {"role": "user", "content": ""}
    ],
    temperature=0.6,
    max_completion_tokens=4096,
    top_p=0.95,
    reasoning_effort="default",
    stream=True,
)

for chunk in completion:
    print(chunk.choices[0].delta.content or "", end="")
```

La aplicación detecta automáticamente estos modelos y ajusta la temperatura, los tokens máximos y el esfuerzo de razonamiento sugeridos cuando se generan proposiciones desde la interfaz.
