import main


def test_main_is_deprecated_for_python_gui() -> None:
    try:
        main.main()
    except main.PythonGuiDeprecatedError as exc:
        assert "deprecated" in str(exc).lower()
        assert "electron-frontend" in str(exc)
    else:
        raise AssertionError("Expected PythonGuiDeprecatedError")


def test_run_raises_python_gui_deprecated_error() -> None:
    try:
        main.run()
    except main.PythonGuiDeprecatedError as exc:
        assert "electron-frontend" in str(exc)
    else:
        raise AssertionError("Expected PythonGuiDeprecatedError")
