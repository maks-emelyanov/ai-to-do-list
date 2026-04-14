import json
from typing import Any, Dict

from openai import OpenAI

SYSTEM_PROMPT = """You are an assistant that breaks a user’s task into practical, momentum-friendly steps for an ADHD-supportive to-do app.

Your goal is to help the user start and sustain progress, not to create the most exhaustive plan possible.

Follow these rules:

1. Break the task into actionable steps that are concrete, observable, and completable.
2. Do NOT go too granular.
   - Avoid tiny mechanical actions like “open the app,” “pick up your phone,” or “stand up,” unless they are genuine blockers or unusually important.
   - Prefer steps that feel meaningful and useful on their own.
3. Target the “right” granularity:
   - Most tasks should become 3 to 8 main steps.
   - More complex tasks can have up to 12 steps.
   - Each step should usually represent roughly 2 to 20 minutes of effort.
   - If a task naturally takes one very short action, keep it as one step.
4. Identify requirements separately from steps.
   - A requirement is something that must be true, known, available, decided, or accessible for a step to happen smoothly.
   - Requirement types: resource, information, decision, access, state_context.
5. Prefer momentum-preserving ordering:
   - Put easy clarifying or unlocking steps early.
   - Group similar effort types together when possible to reduce context switching.
6. Tag each step with attributes that help determine whether it is doable right now:
   - estimated_time_minutes
   - activation_level: low | medium | high
   - thinking_demand: low | medium | high
   - movement_required: none | low | medium | high
   - emotional_friction: low | medium | high
   - location_needed
   - tools_or_materials
   - phone_compatible: true | false
7. Include dependencies:
   - step_dependencies = other step IDs that must happen first
   - requirement_dependencies = requirement IDs that must be ready first
8. Only include requirements and resolution steps that are likely to matter.
   - Do not invent unnecessary blockers.
   - Do not overcomplicate simple tasks.
9. If there are multiple valid ways to do the task, choose the simplest realistic path.
10. Keep wording short, plain, and supportive.
12. Output valid JSON only.

Return JSON in exactly this shape:

{
  "task": {
    "title": "string",
    "goal": "string"
  },
  "assumptions": ["string"],
  "requirements": [
    {
      "id": "R1",
      "label": "string",
      "type": "resource | information | decision | access | state_context",
      "notes": "string"
    }
  ],
  "steps": [
    {
      "id": "S1",
      "title": "string",
      "description": "string",
      "estimated_time_minutes": 5,
      "activation_level": "low | medium | high",
      "thinking_demand": "low | medium | high",
      "movement_required": "none | low | medium | high",
      "emotional_friction": "low | medium | high",
      "location_needed": "string or null",
      "tools_or_materials": ["string"],
      "phone_compatible": true,
      "step_dependencies": [],
      "requirement_dependencies": []
    }
  ]
}"""

USER_PROMPT_TEMPLATE = """Break this task into subtasks for an ADHD-friendly productivity app.

Task: {{TASK_TEXT}}

Important:
- Do not make the breakdown too granular.
- Prefer steps that feel meaningfully progress-making.
- Detect only realistic requirements/blockers.
- Keep the plan simple and usable in real life.
"""

TASK_BREAKDOWN_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["task", "assumptions", "requirements", "steps"],
    "properties": {
        "task": {
            "type": "object",
            "additionalProperties": False,
            "required": ["title", "goal"],
            "properties": {
                "title": {"type": "string"},
                "goal": {"type": "string"},
            },
        },
        "assumptions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "label", "type", "notes"],
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": [
                            "resource",
                            "information",
                            "decision",
                            "access",
                            "state_context",
                        ],
                    },
                    "notes": {"type": "string"},
                },
            },
        },
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "title",
                    "description",
                    "estimated_time_minutes",
                    "activation_level",
                    "thinking_demand",
                    "movement_required",
                    "emotional_friction",
                    "location_needed",
                    "tools_or_materials",
                    "phone_compatible",
                    "step_dependencies",
                    "requirement_dependencies",
                ],
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "estimated_time_minutes": {
                        "type": "integer",
                        "minimum": 1,
                    },
                    "activation_level": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                    },
                    "thinking_demand": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                    },
                    "movement_required": {
                        "type": "string",
                        "enum": ["none", "low", "medium", "high"],
                    },
                    "emotional_friction": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                    },
                    "location_needed": {
                        "type": ["string", "null"],
                    },
                    "tools_or_materials": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "phone_compatible": {"type": "boolean"},
                    "step_dependencies": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "requirement_dependencies": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
    },
}


def build_user_prompt(task_text: str) -> str:
    return USER_PROMPT_TEMPLATE.replace("{{TASK_TEXT}}", task_text.strip())


def break_task_into_subtasks(
    task_text: str,
    model: str = "gpt-5.4-mini",
) -> Dict[str, Any]:
    client = OpenAI()

    response = client.responses.create(
        model=model,
        instructions=SYSTEM_PROMPT,
        input=build_user_prompt(task_text),
        reasoning={"effort": "none"},
        text={
            "format": {
                "type": "json_schema",
                "name": "task_breakdown",
                "strict": True,
                "schema": TASK_BREAKDOWN_SCHEMA,
            }
        },
        store=False,
    )

    if not response.output_text:
        raise ValueError("Model returned no text output.")

    return json.loads(response.output_text)


if __name__ == "__main__":
    task = "Clean the kitchen before guests arrive tomorrow"

    try:
        result = break_task_into_subtasks(task)
        print(json.dumps(result, indent=2))
    except Exception as exc:
        print(f"Error: {exc}")