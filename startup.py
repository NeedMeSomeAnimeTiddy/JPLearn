"""Windows startup helpers for entrypoint scripts."""

from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes

TH32CS_SNAPPROCESS = 0x00000002
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
SW_HIDE = 0


class _ProcessEntry32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.c_size_t),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", wintypes.LONG),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", wintypes.WCHAR * wintypes.MAX_PATH),
    ]


def _parent_process_name() -> str | None:
    kernel32 = ctypes.windll.kernel32
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot == INVALID_HANDLE_VALUE:
        return None

    try:
        entry = _ProcessEntry32()
        entry.dwSize = ctypes.sizeof(_ProcessEntry32)
        if not kernel32.Process32FirstW(snapshot, ctypes.byref(entry)):
            return None

        current_pid = kernel32.GetCurrentProcessId()
        parent_pid = 0
        process_names: dict[int, str] = {}

        while True:
            process_names[int(entry.th32ProcessID)] = entry.szExeFile
            if int(entry.th32ProcessID) == current_pid:
                parent_pid = int(entry.th32ParentProcessID)
            if not kernel32.Process32NextW(snapshot, ctypes.byref(entry)):
                break

        if parent_pid == 0:
            return None
        return process_names.get(parent_pid)
    finally:
        kernel32.CloseHandle(snapshot)


def detach_console_for_gui_launch() -> None:
    """Detach and hide the console only for Explorer-launched GUI entrypoints."""
    if sys.platform != "win32":
        return

    parent_name = _parent_process_name()
    if parent_name is None or parent_name.lower() != "explorer.exe":
        return

    kernel32 = ctypes.windll.kernel32
    hwnd = kernel32.GetConsoleWindow()
    if hwnd:
        ctypes.windll.user32.ShowWindow(hwnd, SW_HIDE)
        kernel32.FreeConsole()
