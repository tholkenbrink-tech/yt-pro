from __future__ import annotations

from app.core.security import MAX_FILENAME_LENGTH, sanitize_filename


def test_path_traversal_stripped():
    result = sanitize_filename("../../etc/passwd", extension=".mp4")
    assert "/" not in result
    assert ".." not in result or result.count("..") == 0
    assert result.endswith(".mp4")


def test_null_bytes_stripped():
    result = sanitize_filename("evil\x00name", extension=".mp4")
    assert "\x00" not in result


def test_extremely_long_name_truncated():
    result = sanitize_filename("a" * 1000, extension=".mp4")
    assert len(result) <= MAX_FILENAME_LENGTH


def test_empty_name_falls_back_to_default():
    result = sanitize_filename("", default="fallback", extension=".mp4")
    assert result == "fallback.mp4"


def test_control_chars_stripped():
    result = sanitize_filename("na\x01me\x1f.mp4")
    assert all(ord(c) >= 32 for c in result)
