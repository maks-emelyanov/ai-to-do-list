# todoapp

A small Python prototype that uses the OpenAI Responses API to turn a user task into an ADHD-supportive step-by-step plan.

## What It Does

Given a task like "Clean the kitchen before guests arrive tomorrow", the app asks an OpenAI model to return structured JSON with:

- a task title and goal
- a short list of assumptions
- likely requirements or blockers
- practical, momentum-friendly action steps
- effort and dependency metadata for each step

The current example lives in [`main.py`](/home/maks/code/todoapp/main.py).

## Requirements

- Python 3.12+
- an OpenAI API key in `OPENAI_API_KEY`
- `uv` for dependency management, if you want to use the included lockfile workflow

## Setup

Install dependencies:

```bash
uv sync
```

Set your API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

## Run

```bash
uv run python main.py
```

The script currently runs a built-in example task and prints the JSON result to stdout.

## Project Files

- [`main.py`](/home/maks/code/todoapp/main.py): app entry point and prompt/schema definition
- [`pyproject.toml`](/home/maks/code/todoapp/pyproject.toml): project metadata and dependencies
- [`uv.lock`](/home/maks/code/todoapp/uv.lock): locked dependency versions

## Initial Commit Notes

The repository is set up to keep local-only files out of version control, including:

- virtual environments
- `.env` files
- Python caches and build artifacts
- local `.codex` metadata
