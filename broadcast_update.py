#!/usr/bin/env python3
"""
JEE Rivals & Test Maker - System Update Broadcast Tool:
Allows administrators and instructors to broadcast platform updates, question bank
expansions, syllabus revisions, and urgent announcements.
Instantly delivers real-time toast notifications and in-app alerts to all users.
"""
import sys
import os
import argparse
from pathlib import Path

# Configure UTF-8 encoding
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add Rivals backend directory to Python path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

try:
    from backend.app.tools.system_updates_engine import post_system_update
    from backend.app.database import get_connection
except ImportError:
    # If run from JEE Test Taker or external dir
    alt_rivals = Path(r"c:\Users\Priyashree Sarkar\Desktop\JEE Rivals")
    if alt_rivals.exists():
        sys.path.insert(0, str(alt_rivals))
        from backend.app.tools.system_updates_engine import post_system_update
        from backend.app.database import get_connection
    else:
        print("[ERROR] Could not import backend system_updates_engine. Please check paths.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Broadcast a platform, syllabus, question bank, or moderation update to all users."
    )
    parser.add_argument("title", type=str, help="Title of the update announcement")
    parser.add_argument("--summary", "-s", type=str, required=True, help="Summary snippet displayed on toast & notification panel")
    parser.add_argument("--category", "-c", type=str, default="PLATFORM", choices=["PLATFORM", "QUESTION_BANK", "SYLLABUS", "MODERATION", "ANNOUNCEMENT"], help="Category of update")
    parser.add_argument("--version", "-v", type=str, default="v2.4.1", help="Version tag (e.g. v2.4.1)")
    parser.add_argument("--details", "-d", type=str, default="", help="Detailed narrative for the What's New modal")
    parser.add_argument("--highlights", "-H", type=str, default="", help="Comma-separated list of bullet highlights")
    parser.add_argument("--author", "-a", type=str, default="System Admin", help="Author name / signature")

    args = parser.parse_args()

    highlights_list = [h.strip() for h in args.highlights.split(",") if h.strip()] if args.highlights else []

    print("\n" + "="*60)
    print("  [BROADCAST ENGINE] POSTING NEW PLATFORM UPDATE")
    print("="*60)
    print(f"  * Title:      {args.title}")
    print(f"  * Category:   {args.category.upper()}")
    print(f"  * Version:    {args.version}")
    print(f"  * Author:     {args.author}")
    print(f"  * Summary:    {args.summary}")
    if highlights_list:
        print(f"  * Highlights: {len(highlights_list)} items")
        for hl in highlights_list:
            print(f"      - {hl}")
    print("="*60)

    try:
        upd_id = post_system_update(
            title=args.title,
            summary=args.summary,
            category=args.category,
            version=args.version,
            details=args.details,
            highlights=highlights_list,
            author=args.author
        )
        print(f"\n[SUCCESS] Update broadcasted with ID: {upd_id}")
        print("All users will receive a floating toast notification and unread badge in their notification panel.\n")
    except Exception as e:
        print(f"\n[ERROR] Failed to post system update: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
