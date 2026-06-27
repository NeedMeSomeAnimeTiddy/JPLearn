# Local GGUF Models

Drop your `.gguf` model file(s) in this folder.

JPLearn now auto-detects:
- llama.cpp CLI at `tools/llama.cpp/build/bin/Release/llama-cli.exe`
- the first `.gguf` model in this folder

Optional env overrides:
- `JPLEARN_TUTOR_PROVIDER=llama.cpp`
- `JPLEARN_LLAMA_CPP_PATH=<absolute path to llama-cli.exe>`
- `JPLEARN_LLAMA_MODEL_PATH=<absolute path to model.gguf>`
