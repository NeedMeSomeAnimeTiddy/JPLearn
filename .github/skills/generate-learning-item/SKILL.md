---
name: generate-learning-item
description: Creates a new Japanese learning item from input text using Domain logic and persists it in the system.
---

Input:
- Raw Japanese text or vocabulary entry

Outcome:
- A validated learning item is created and stored in the system

Constraints:
- Must respect Domain/Data separation
- Domain handles parsing and validation
- Data handles persistence
- No direct business logic inside Skill