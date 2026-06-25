---
description: Global rules for Japanese SRS application
applyTo: ""
---

# Global Rules

- Python 3.11+
- Type hints required for all public APIs
- Prefer simple, direct implementations
- Use pytest for testing
- Keep code minimal and readable

---

# System Overview

Japanese learning app using spaced repetition for vocabulary and kanji.

Architecture:
- domain/ → learning logic
- data/ → SQLite persistence
- ui/ → presentation layer