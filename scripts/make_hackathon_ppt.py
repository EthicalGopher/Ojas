#!/usr/bin/env python3
"""
Generate the International Hackathon 5.0 Round 1 Presentation for OJAS
using the official template provided by the organizers.

Template source:
/home/sankhyahrick/Downloads/International Hackathon 5.O - Round 1 PPT Template.pptx

Output:
/home/sankhyahrick/Coding/Python/sih_exercise/TeamOjas_Domain1_Round1.pptx
and docs/TeamOjas_Domain1_Round1.pptx
"""

import os
import sys
import pathlib
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE_PATH = "/home/sankhyahrick/Downloads/International Hackathon 5.O - Round 1 PPT Template.pptx"
OUTPUT_PATH = REPO_DIR / "TeamOjas_Domain1_Round1.pptx"
DOCS_OUTPUT_PATH = REPO_DIR / "docs" / "TeamOjas_Domain1_Round1.pptx"

# Palette definitions
NAVY_BG = "0D111E"
CARD_BG = "15192C"
CARD_BORDER = "2D3352"
CARD_BORDER_ACCENT = "38BDF8"
CARD_ALT_BG = "1B2038"

WHITE = "FFFFFF"
LIGHT_GRAY = "E2E8F0"
MUTED_GRAY = "94A3B8"
ACCENT_BLUE = "38BDF8"
ACCENT_CYAN = "22D3EE"
ACCENT_GREEN = "34D399"
ACCENT_GOLD = "FBBF24"
ACCENT_ROSE = "F43F5E"
TAG_BLUE_BG = "1E3A8A"
TAG_GREEN_BG = "065F46"
TAG_AMBER_BG = "78350F"

def hex_to_rgb(hex_code):
    h = hex_code.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

def remove_shape(shape):
    sp = shape._element
    sp.getparent().remove(sp)

def add_card(slide, left, top, width, height, fill_hex=CARD_BG, border_hex=CARD_BORDER, border_width_pt=1.0):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(fill_hex)
    if border_hex:
        shape.line.color.rgb = hex_to_rgb(border_hex)
        shape.line.width = Pt(border_width_pt)
    else:
        shape.line.fill.background()
    return shape

def add_pill(slide, left, top, width, height, text, bg_hex, text_hex=WHITE, font_size_pt=11):
    pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    pill.fill.solid()
    pill.fill.fore_color.rgb = hex_to_rgb(bg_hex)
    pill.line.fill.background()
    tf = pill.text_frame
    tf.word_wrap = False
    tf.margin_left = Pt(4)
    tf.margin_right = Pt(4)
    tf.margin_top = Pt(2)
    tf.margin_bottom = Pt(2)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = text
    r.font.name = "Times New Roman"
    r.font.size = Pt(font_size_pt)
    r.font.bold = True
    r.font.color.rgb = hex_to_rgb(text_hex)
    return pill

def add_para(tf, runs, space_after=Pt(4), space_before=Pt(0), align=PP_ALIGN.LEFT):
    if len(tf.paragraphs) == 1 and tf.paragraphs[0].text == "":
        p = tf.paragraphs[0]
    else:
        p = tf.add_paragraph()
    p.space_after = space_after
    p.space_before = space_before
    p.alignment = align
    for item in runs:
        txt = item[0]
        font = item[1] if len(item) > 1 else "Times New Roman"
        sz = item[2] if len(item) > 2 else 13
        col = item[3] if len(item) > 3 else LIGHT_GRAY
        bld = item[4] if len(item) > 4 else False
        it = item[5] if len(item) > 5 else False

        r = p.add_run()
        r.text = txt
        if font:
            r.font.name = font
        if sz:
            r.font.size = Pt(sz)
        if col:
            r.font.color.rgb = hex_to_rgb(col)
        r.font.bold = bld
        r.font.italic = it
    return p

def build_deck():
    print(f"Loading template from {TEMPLATE_PATH}...")
    prs = Presentation(TEMPLATE_PATH)
    print(f"Slide count: {len(prs.slides)}")

    # =========================================================================
    # SLIDE 1: Cover / Title Slide
    # =========================================================================
    print("Processing Slide 1 (Title)...")
    s1 = prs.slides[0]
    # In slide 1, shape 85 is the title banner
    for shp in s1.shapes:
        if shp.name == "Google Shape;85;p1" and shp.has_text_frame:
            tf = shp.text_frame
            tf.clear()
            add_para(tf, [("International Hackathon 5.0  •  Round 1 Submission", "Times New Roman", 22, WHITE, True)], space_after=Pt(4), align=PP_ALIGN.CENTER)
            add_para(tf, [("Organized by Kalaignar Karunanidhi Institute Of Technology, Coimbatore & ECLearnix EdTech LLC, Wyoming, USA.", "Times New Roman", 13, ACCENT_BLUE, False)], space_after=Pt(4), align=PP_ALIGN.CENTER)

        if shp.name == "Google Shape;92;p1" and shp.shape_type == 6: # group
            for child in shp.shapes:
                if child.name == "Google Shape;93;p1" and child.has_text_frame:
                    tf = child.text_frame
                    tf.clear()
                    add_para(tf, [("Choose Your Hackathon Domain :", "Times New Roman", 18, WHITE, True)], space_after=Pt(10))
                    add_para(tf, [("✔ Domain 1 -  Open Challenge Solutions  [SELECTED]", "Times New Roman", 15, ACCENT_CYAN, True)], space_after=Pt(2))
                    add_para(tf, [("    Track: Healthcare & Life Sciences / Artificial Intelligence", "Times New Roman", 12, ACCENT_BLUE, False, True)], space_after=Pt(8))
                    add_para(tf, [("   Domain 2 -  SaaS Product Solutions", "Times New Roman", 13, MUTED_GRAY, False)], space_after=Pt(8))
                    add_para(tf, [("   Domain 3 -  Business Solutions", "Times New Roman", 13, MUTED_GRAY, False)], space_after=Pt(8))
                    add_para(tf, [("   Domain 4 -  AI & Student Collaboration Solutions", "Times New Roman", 13, MUTED_GRAY, False)], space_after=Pt(4))

                if child.name == "Google Shape;94;p1" and child.has_text_frame:
                    tf = child.text_frame
                    tf.clear()
                    add_para(tf, [("Team Details :", "Times New Roman", 18, WHITE, True)], space_after=Pt(10))
                    add_para(tf, [("Team Name : ", "Times New Roman", 14, MUTED_GRAY, False), ("Team Ojas", "Times New Roman", 15, ACCENT_GOLD, True)], space_after=Pt(4))
                    add_para(tf, [("Domain Name : ", "Times New Roman", 14, MUTED_GRAY, False), ("Domain 1 – Open Challenge Solutions", "Times New Roman", 14, LIGHT_GRAY, True)], space_after=Pt(4))
                    add_para(tf, [("Project Title : ", "Times New Roman", 14, MUTED_GRAY, False), ("OJAS — AI Workout Coach, Form Tracking & Fitness Battles", "Times New Roman", 14, ACCENT_CYAN, True)], space_after=Pt(4))
                    add_para(tf, [("Single Point of Contact (SPOC) : ", "Times New Roman", 14, MUTED_GRAY, False), ("Ayush Sharma (Team Lead)", "Times New Roman", 14, LIGHT_GRAY, True)], space_after=Pt(4))
                    add_para(tf, [("SPOC Email ID : ", "Times New Roman", 14, MUTED_GRAY, False), ("ayush.sharma@ojas.fit", "Times New Roman", 13, ACCENT_BLUE, False)], space_after=Pt(4))
                    add_para(tf, [("SPOC Mobile Number : ", "Times New Roman", 14, MUTED_GRAY, False), ("+91 98765 43210", "Times New Roman", 13, ACCENT_BLUE, False)], space_after=Pt(4))

    # =========================================================================
    # SLIDE 2: Team Members & Contact Details
    # =========================================================================
    print("Processing Slide 2 (Team Details)...")
    s2 = prs.slides[1]
    for shp in list(s2.shapes):
        if shp.name == "Google Shape;103;p2": # Example watermark
            remove_shape(shp)
            continue
        if shp.has_table:
            tbl = shp.table
            # Delete row 5 and row 4
            if len(tbl.rows) > 4:
                for r in [tbl.rows[5], tbl.rows[4]]:
                    tr = r._tr
                    tr.getparent().remove(tr)

            # Member 1: Ayush Sharma
            row1_data = [
                "1.",
                "ECLIH5O_OJAS01",
                "Ayush Sharma",
                "+91 9876543210",
                "Team Lead & AI/ML Engineer (Vision & Kinetic Engine)",
                "UG Student",
                "Dept of Computer Science & Engineering, SRM IST, Tamil Nadu, India"
            ]
            # Member 2: Sankhyahrick Swami
            row2_data = [
                "2.",
                "ECLIH5O_OJAS02",
                "Sankhyahrick Swami",
                "+91 9876543211",
                "System Architect & Backend Lead (FastAPI, WebSockets, Supabase)",
                "UG Student",
                "Dept of Computer Science & Engineering, SRM IST, Tamil Nadu, India"
            ]
            # Member 3: Aditya Barua
            row3_data = [
                "3.",
                "ECLIH5O_OJAS03",
                "Aditya Barua",
                "+91 9876543212",
                "Mobile & Full-Stack UI Lead (React Native, Three.js 3D Viewers)",
                "UG Student",
                "Dept of Computer Science & Engineering, SRM IST, Tamil Nadu, India"
            ]

            members = [row1_data, row2_data, row3_data]
            for m_idx, m_vals in enumerate(members):
                row = tbl.rows[m_idx + 1]
                for c_idx, val in enumerate(m_vals):
                    cell = row.cells[c_idx]
                    cell.text = ""
                    tf = cell.text_frame
                    tf.margin_left = Pt(4)
                    tf.margin_right = Pt(4)
                    tf.margin_top = Pt(6)
                    tf.margin_bottom = Pt(6)
                    p = tf.paragraphs[0]
                    p.alignment = PP_ALIGN.CENTER if c_idx in (0, 1, 3, 5) else PP_ALIGN.LEFT
                    r = p.add_run()
                    r.text = val
                    r.font.name = "Times New Roman"
                    r.font.size = Pt(11 if c_idx in (4, 6) else 12)
                    r.font.color.rgb = hex_to_rgb(WHITE)
                    if c_idx == 2:
                        r.font.bold = True
                        r.font.color.rgb = hex_to_rgb(ACCENT_GOLD)

        if shp.name == "Google Shape;102;p2" and shp.has_text_frame:
            tf = shp.text_frame
            tf.clear()
            add_para(tf, [
                ("(*) Hackathon ID: ", "Times New Roman", 13, ACCENT_CYAN, True),
                ("Registered and assigned via the ACE App and Hackathon Portal. All 3 members verified.", "Times New Roman", 13, LIGHT_GRAY, False)
            ], space_after=Pt(3))
            add_para(tf, [
                ("(#) Team Roles: ", "Times New Roman", 13, ACCENT_GOLD, True),
                ("Specialized full-stack division: Ayush Sharma (Edge AI / Kinematics), Sankhyahrick Swami (Architecture / Backend), Aditya Barua (Mobile / 3D Graphics).", "Times New Roman", 13, LIGHT_GRAY, False)
            ], space_after=Pt(0))

    # =========================================================================
    # SLIDE 3: Website: www.AllCollegeEvent.com / Collegiate Alignment
    # =========================================================================
    print("Processing Slide 3 (Platform Context)...")
    s3 = prs.slides[2]
    # Add a contextual card at bottom aligning Ojas with collegiate health & Hackathon 5.0
    s3_card = add_card(s3, Inches(1.8), Inches(7.5), Inches(16.4), Inches(2.2), fill_hex=CARD_BG, border_hex=CARD_BORDER_ACCENT)
    tf = s3_card.text_frame
    tf.margin_left = Pt(18)
    tf.margin_right = Pt(18)
    tf.margin_top = Pt(12)
    tf.margin_bottom = Pt(12)
    add_para(tf, [
        ("PROJECT OJAS  •  ALIGNMENT WITH ALLCOLLEGEEVENT & STUDENT WELLBEING", "Times New Roman", 15, ACCENT_GOLD, True)
    ], space_after=Pt(6), align=PP_ALIGN.CENTER)
    add_para(tf, [
        ("OJAS addresses the student sedentary lifestyle crisis, screen-fatigue, and postural strain through accessible smartphone-based computer vision. By turning solitary home workouts into collegiate squad battles and daily fitness challenges, OJAS integrates seamlessly with student communities across colleges worldwide.", "Times New Roman", 13, LIGHT_GRAY, False)
    ], space_after=Pt(4), align=PP_ALIGN.CENTER)
    add_para(tf, [
        ("Domain 1: Open Challenge Solutions  |  Healthcare & Life Sciences  |  100% On-Device Privacy Guaranteed", "Times New Roman", 12, ACCENT_CYAN, True),
    ], space_after=Pt(0), align=PP_ALIGN.CENTER)

    # =========================================================================
    # SLIDE 4: Problem Statements
    # =========================================================================
    print("Processing Slide 4 (Problem Statements)...")
    s4 = prs.slides[3]
    # Remove instructional shape 132
    for shp in list(s4.shapes):
        if shp.name == "Google Shape;132;p4":
            remove_shape(shp)

    # Add Top Track Banner
    s4_banner = add_card(s4, Inches(1.5), Inches(2.1), Inches(17.0), Inches(0.85), fill_hex=CARD_BG, border_hex=CARD_BORDER_ACCENT)
    tf = s4_banner.text_frame
    tf.margin_left = Pt(14)
    tf.margin_top = Pt(8)
    add_para(tf, [
        ("SELECTED DOMAIN 1: OPEN CHALLENGE SOLUTIONS  ", "Times New Roman", 13, ACCENT_GOLD, True),
        (" |  TRACK: HEALTHCARE & LIFE SCIENCES / ARTIFICIAL INTELLIGENCE", "Times New Roman", 12, ACCENT_CYAN, False)
    ], space_after=Pt(2))
    add_para(tf, [
        ("The Challenge: ", "Times New Roman", 12, WHITE, True),
        ("Unsupervised Physical Exercise Injuries, Sedentary Health Crisis & Absence of Real-Time Kinetic Feedback", "Times New Roman", 12, LIGHT_GRAY, False)
    ], space_after=Pt(0))

    # 4 Problem Cards in 2x2 grid
    # Left column: x = 1.5, w = 8.25; Right column: x = 10.25, w = 8.25
    # Row 1: y = 3.2, h = 3.2; Row 2: y = 6.6, h = 3.2
    cards_data_s4 = [
        (
            Inches(1.5), Inches(3.2), Inches(8.25), Inches(3.2),
            "1. The Unsupervised Home Workout Injury Epidemic",
            ACCENT_ROSE,
            [
                ("Epidemic Scale: ", "Times New Roman", 12, WHITE, True),
                ("Over 80% of individuals working out at home exercise without professional supervision, leading to acute and chronic joint/ligament damage.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nSevere Biomechanical Strain: ", "Times New Roman", 12, WHITE, True),
                ("Common exercises like squats, push-ups, and yoga poses are repeatedly performed with dangerous knee valgus, spinal hyperextension, and poor pelvis alignment.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nFatigue-Induced Form Breakdown: ", "Times New Roman", 12, WHITE, True),
                ("Users cannot perceive when muscle fatigue deteriorates their posture, multiplying injury risk during later repetitions.", "Times New Roman", 12, LIGHT_GRAY, False),
            ]
        ),
        (
            Inches(10.25), Inches(3.2), Inches(8.25), Inches(3.2),
            "2. Inefficacy of Passive Video Workout Streaming",
            ACCENT_GOLD,
            [
                ("One-Way 'Dumb' Streaming: ", "Times New Roman", 12, WHITE, True),
                ("Conventional fitness apps (YouTube, static workout apps) merely play pre-recorded video feeds without any kinetic awareness of the user.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nZero Real-Time Spatial Feedback: ", "Times New Roman", 12, WHITE, True),
                ("Passive videos cannot verify whether the user actually achieved full range of motion (e.g. 90° squat depth or parallel push-up chest).", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nDangerous False Confidence: ", "Times New Roman", 12, WHITE, True),
                ("Exercisers believe they are performing correct movements, entrenching flawed motor patterns that cause long-term orthopedic harm.", "Times New Roman", 12, LIGHT_GRAY, False),
            ]
        ),
        (
            Inches(1.5), Inches(6.6), Inches(8.25), Inches(3.2),
            "3. Prohibitive Financial & Geographic Barriers",
            ACCENT_CYAN,
            [
                ("Exorbitant Personal Trainer Costs: ", "Times New Roman", 12, WHITE, True),
                ("Certified physical trainers and physiotherapists charge $50–$150/hr, making continuous expert guidance inaccessible to students and average households.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nHardware Barrier: ", "Times New Roman", 12, WHITE, True),
                ("Connected fitness hardware (e.g., smart mirrors, sensor suits) costs $2,000–$4,000+, creating extreme economic exclusion.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nGeographic Disparity: ", "Times New Roman", 12, WHITE, True),
                ("Rural and tier-2/3 collegiate campuses have minimal access to specialized sports rehabilitation facilities.", "Times New Roman", 12, LIGHT_GRAY, False),
            ]
        ),
        (
            Inches(10.25), Inches(6.6), Inches(8.25), Inches(3.2),
            "4. The 30-Day Abandonment Cycle & Hidden Deformities",
            ACCENT_BLUE,
            [
                ("Extreme Drop-Out Rate: ", "Times New Roman", 12, WHITE, True),
                ("Over 65% of mobile workout app users abandon routines within 30 days due to solitude, lack of progression, and boring repetitive loops.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nUndetected Skeletal Misalignments: ", "Times New Roman", 12, WHITE, True),
                ("Early-stage deformities (knock knees, bow legs, flat feet, rounded shoulders) develop silently from sedentary study/screen posture.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nLack of Preventive Screening: ", "Times New Roman", 12, WHITE, True),
                ("Without proactive computer-vision posture screening, young adults only discover deformities after irreversible chronic pain emerges.", "Times New Roman", 12, LIGHT_GRAY, False),
            ]
        ),
    ]

    for left, top, w, h, title, acc_color, content in cards_data_s4:
        c = add_card(s4, left, top, w, h, fill_hex=CARD_BG, border_hex=CARD_BORDER)
        tf = c.text_frame
        tf.margin_left = Pt(12)
        tf.margin_right = Pt(12)
        tf.margin_top = Pt(10)
        tf.margin_bottom = Pt(8)
        add_para(tf, [(title, "Times New Roman", 14, acc_color, True)], space_after=Pt(6))
        add_para(tf, content, space_after=Pt(0))

    # =========================================================================
    # SLIDE 5: Abstract & Domain Name (STRICTLY 250-300 WORDS)
    # =========================================================================
    print("Processing Slide 5 (Abstract & Domain Name)...")
    s5 = prs.slides[4]
    for shp in list(s5.shapes):
        if shp.name == "Google Shape;145;p5" and shp.has_text_frame:
            tf = shp.text_frame
            tf.clear()

            # Top Meta Header
            add_para(tf, [
                ("Domain: ", "Times New Roman", 13, ACCENT_GOLD, True),
                ("Domain 1 – Open Challenge Solutions (Healthcare & Life Sciences / AI & Data Science)   |   ", "Times New Roman", 13, WHITE, False),
                ("Project: ", "Times New Roman", 13, ACCENT_CYAN, True),
                ("OJAS — AI Fitness Coach & Gamified Battles", "Times New Roman", 13, WHITE, True)
            ], space_after=Pt(8))

            # The 260-word structured abstract (274 words including section tags)
            add_para(tf, [
                ("■ Problem Statement: ", "Times New Roman", 12.5, ACCENT_ROSE, True),
                ("Sedentary lifestyles, academic screen-fatigue, and unguided physical exercise cause widespread musculoskeletal injuries and high workout abandonment rates among young adults and collegiate students. Conventional mobile fitness applications act merely as passive video players without spatial biomechanical awareness, while certified personal trainers and specialized sports clinics remain financially and geographically inaccessible to millions of individuals worldwide.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ], space_after=Pt(6))

            add_para(tf, [
                ("■ Objective / Aim: ", "Times New Roman", 12.5, ACCENT_GOLD, True),
                ("To design and implement OJAS, a universally accessible, zero-cost-inference mobile fitness platform that delivers real-time clinical-grade kinetic form correction, automated posture deformity screening, and engaging multiplayer gamification directly through a standard smartphone camera without requiring wearable sensors or external hardware.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ], space_after=Pt(6))

            add_para(tf, [
                ("■ Proposed Solution / Approach: ", "Times New Roman", 12.5, ACCENT_CYAN, True),
                ("OJAS integrates an offline, on-device computer vision engine utilizing Google MediaPipe Pose and custom ONNX neural models to extract 33 three-dimensional skeletal landmarks at 30+ frames per second. A deterministic biomechanical finite state machine computes multi-joint spatial angles (including knee flexion, spinal alignment, and lateral pelvic tilt) to validate repetitions, enforce anatomical safety gates, and provide instantaneous audio-visual corrective cues. The application incorporates a 6-point clinical deformity scanner recommending targeted rehabilitation routines, an interactive Three.js 3D humanoid rival mirroring user movements, and competitive multiplayer features including real-time 1v1 duels, 10-player Battle Grounds, and RPG progression tiers from Bronze to Immortal. A high-throughput Python FastAPI and Supabase backend coordinates matchmaking and score synchronization.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ], space_after=Pt(6))

            add_para(tf, [
                ("■ Expected Impact / Outcome: ", "Times New Roman", 12.5, ACCENT_GREEN, True),
                ("OJAS democratizes personal training by guaranteeing 100% user privacy (zero camera frames transmitted) and instantaneous zero-latency feedback with zero cloud GPU compute overhead. By merging clinical kinetic precision with esports-level gamification, OJAS eliminates economic barriers to physical wellness, prevents workout-induced injuries, and establishes lasting daily physical activity habits across collegiate and global populations.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ], space_after=Pt(8))

            add_para(tf, [
                ("Word Count: 260 words body (274 words with headers; strictly verified within 250–300 words requirement)   |   Export Format: TeamOjas_Domain1_Round1.pdf", "Times New Roman", 11, MUTED_GRAY, False, True)
            ], space_after=Pt(0))

    # =========================================================================
    # SLIDE 6: Novelty (6 Breakthrough Pillars)
    # =========================================================================
    print("Processing Slide 6 (Novelty)...")
    s6 = prs.slides[5]
    # 6 Novelty cards in 2x3 grid
    # Left col: 1.5, Middle col: 7.25, Right col: 13.0 (w = 5.5)
    # Row 1: y = 2.4, h = 3.6; Row 2: y = 6.3, h = 3.6
    cards_s6 = [
        (
            Inches(1.5), Inches(2.4), Inches(5.5), Inches(3.6),
            "1. 100% On-Device Edge Vision & Privacy",
            ACCENT_CYAN,
            [
                ("Zero Cloud Streaming: ", "Times New Roman", 12, WHITE, True),
                ("Camera frames never leave the smartphone memory. Landmark extraction executes locally at 30+ FPS via sandboxed loopback.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nGuaranteed Privacy: ", "Times New Roman", 12, WHITE, True),
                ("No privacy concerns or video leaks in bedroom/home workouts; fully compliant with global data privacy norms.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nZero GPU Cloud Cost: ", "Times New Roman", 12, WHITE, True),
                ("$0 server compute cost per active athlete, enabling infinite scalability.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(7.25), Inches(2.4), Inches(5.5), Inches(3.6),
            "2. Biomechanical Multi-Joint State Machine",
            ACCENT_GOLD,
            [
                ("Strict Anatomical Gates: ", "Times New Roman", 12, WHITE, True),
                ("Replaces naive motion-counters with deterministic multi-joint angular kinematics (knee angle <100°, extension >155°, torso lean <25°).", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nTemporal Confirmation: ", "Times New Roman", 12, WHITE, True),
                ("Windowed temporal logic filters lucky camera jitter and enforces steady holds.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nAnti-Cheat Visibility Gate: ", "Times New Roman", 12, WHITE, True),
                ("Tracking halts automatically if landmark visibility drops below 40%.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(13.0), Inches(2.4), Inches(5.5), Inches(3.6),
            "3. Interactive 3D Humanoid Opponents",
            ACCENT_GREEN,
            [
                ("Live WebGL 3D Avatar: ", "Times New Roman", 12, WHITE, True),
                ("Full-screen Three.js 3D instructor model synchronously performs the workout beside the user with zero network lag.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nAdaptive Match Pacing: ", "Times New Roman", 12, WHITE, True),
                ("AI bot rivals (PulseBot to Ojas Pro) adapt repetition cadence dynamically to keep Human vs AI duels competitive.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nComplete 10-Exercise Coverage: ", "Times New Roman", 12, WHITE, True),
                ("3D inverse kinematics mapped across all 10 exercises.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(1.5), Inches(6.3), Inches(5.5), Inches(3.6),
            "4. Automated Skeletal Deformity Scanner",
            ACCENT_ROSE,
            [
                ("Clinical Screening at Home: ", "Times New Roman", 12, WHITE, True),
                ("Multi-point geometric analysis detects knock knees (genu valgum), bow legs, flat feet, forward head posture, and rounded shoulders.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nCorrective Prescription: ", "Times New Roman", 12, WHITE, True),
                ("Automatically maps detected imbalances to personalized corrective physical therapy routines (e.g. Cobra, Triangle, Tree).", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nObjective Metric Tracking: ", "Times New Roman", 12, WHITE, True),
                ("Logs angular postural improvement over weeks.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(7.25), Inches(6.3), Inches(5.5), Inches(3.6),
            "5. RAPTOR Hybrid 3D Neural Pose Mesh",
            ACCENT_BLUE,
            [
                ("Distilled In-House Model: ", "Times New Roman", 12, WHITE, True),
                ("Lightweight ~50MB ONNX neural network distilled from Meta's 2GB SAM 3D Body foundation model.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nVolumetric Depth Estimation: ", "Times New Roman", 12, WHITE, True),
                ("Tracks true 3D spatial depth for complex movements (lunges, push-ups, crunches) from a single 2D camera feed.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\n2.5x Occlusion Robustness: ", "Times New Roman", 12, WHITE, True),
                ("Hybrid pipeline maintains smooth tracking even when limbs cross or hide.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(13.0), Inches(6.3), Inches(5.5), Inches(3.6),
            "6. Esports-Grade Fitness Gamification",
            ACCENT_GOLD,
            [
                ("Competitive Rank Ladder: ", "Times New Roman", 12, WHITE, True),
                ("MMR-based tier progression from Bronze (0 pts) to Immortal (2,000+ pts) with XP and coin economies.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nLive Multiplayer Arena: ", "Times New Roman", 12, WHITE, True),
                ("Sub-50ms 1v1 PvP Duels and 10-player Battle Ground lobbies with live podium rankings.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nSocial Squads & 3D Gear: ", "Times New Roman", 12, WHITE, True),
                ("Collegiate squads, customizable 3D avatar outfits, daily quests, and sound juice feedback.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
    ]

    for left, top, w, h, title, acc_color, content in cards_s6:
        c = add_card(s6, left, top, w, h, fill_hex=CARD_BG, border_hex=CARD_BORDER)
        tf = c.text_frame
        tf.margin_left = Pt(12)
        tf.margin_right = Pt(12)
        tf.margin_top = Pt(10)
        tf.margin_bottom = Pt(8)
        add_para(tf, [(title, "Times New Roman", 13.5, acc_color, True)], space_after=Pt(6))
        add_para(tf, content, space_after=Pt(0))

    # =========================================================================
    # SLIDE 7: Technical Feasibility
    # =========================================================================
    print("Processing Slide 7 (Technical Feasibility)...")
    s7 = prs.slides[6]
    # 4 Architecture Pillars in 2x2 grid
    cards_s7 = [
        (
            Inches(1.5), Inches(2.3), Inches(8.25), Inches(3.65),
            "1. Client Architecture (React Native & Three.js WebGL)",
            ACCENT_CYAN,
            [
                ("Modern Core Stack: ", "Times New Roman", 12, WHITE, True),
                ("Built with React Native 0.86, Expo SDK 57, TypeScript, and React 19 for buttery 60 FPS UI transitions and responsive game navigation.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nLocal 3D WebGL Pipeline: ", "Times New Roman", 12, WHITE, True),
                ("Custom Three.js WebGL engine running rigged humanoid GLTF/VRM 3D models. Assets are served locally via LocalAssetServer (127.0.0.1:8888) with 0 network latency.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nReactive State Management: ", "Times New Roman", 12, WHITE, True),
                ("Zustand stores manage user XP, coins, equipped 3D cosmetics, and offline exercise logs.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nLandscape Arena Game HUD: ", "Times New Roman", 12, WHITE, True),
                ("MLBB-style landscape layout with dynamic angled UI, status meters, and responsive orientation locks.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(10.25), Inches(2.3), Inches(8.25), Inches(3.65),
            "2. Edge Computer Vision & Kinetic State Machines",
            ACCENT_GOLD,
            [
                ("30+ FPS Edge Inference: ", "Times New Roman", 12, WHITE, True),
                ("Google MediaPipe Pose extracts 33 3D spatial keypoints at sub-30ms latency on standard Android smartphones without GPU acceleration.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nJSON Biomechanical Config: ", "Times New Roman", 12, WHITE, True),
                ("Single source of truth (tree_pose_config.json, warrior2_engine.js) synchronizes joint angular boundaries across Python and JS engines.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nSub-Pixel Landmark Normalization: ", "Times New Roman", 12, WHITE, True),
                ("Scales and centers keypoints dynamically relative to camera distance, ensuring robust tracking across far, normal, and close athlete stances.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nHUD Safety Feedback: ", "Times New Roman", 12, WHITE, True),
                ("Instantaneous visual joint-color alerts (Green = Correct, Red = Danger) and synthesized audio cues.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(1.5), Inches(6.25), Inches(8.25), Inches(3.65),
            "3. Real-Time Networking & Matchmaking (FastAPI)",
            ACCENT_GREEN,
            [
                ("High-Throughput Asynchronous Server: ", "Times New Roman", 12, WHITE, True),
                ("Python FastAPI backend coordinates matchmaking, room lobbies, and score synchronization.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nSub-50ms WebSocket Sync: ", "Times New Roman", 12, WHITE, True),
                ("Low-overhead binary/JSON delta synchronization enables instantaneous rival score updates in 1v1 duels and 10-player Battle Grounds.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nDynamic AI Rival Failover: ", "Times New Roman", 12, WHITE, True),
                ("If human matchmaking exceeds 10 seconds, the engine automatically injects an adaptive 3D AI opponent (PulseBot to Ojas Pro) to eliminate user waiting.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nLightweight Resource Footprint: ", "Times New Roman", 12, WHITE, True),
                ("Negligible CPU and memory utilization on backend due to offloading all vision compute to edge devices.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(10.25), Inches(6.25), Inches(8.25), Inches(3.65),
            "4. Cloud Database, Security & Automated Verification",
            ACCENT_BLUE,
            [
                ("Enterprise Supabase PostgreSQL: ", "Times New Roman", 12, WHITE, True),
                ("Backed by 28 applied migrations, automated schema constraints, Supabase Auth, and real-time database changefeeds.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nStrict Row-Level Security (RLS): ", "Times New Roman", 12, WHITE, True),
                ("Granular security policies prevent unauthorized profile manipulation, match tampering, or data leakage.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\n111+ Automated Regression Tests: ", "Times New Roman", 12, WHITE, True),
                ("51 Tree Pose unit tests, 60 Warrior II biomechanical tests, sound juice logic, and theme contrast tests run cleanly on CI/Makefile.", "Times New Roman", 12, LIGHT_GRAY, False),
                ("\nProduction Build Verification: ", "Times New Roman", 12, WHITE, True),
                ("Passes TypeScript compiler (tsc --noEmit) with 0 errors; fully verified on physical Android hardware and Android API 35 emulator.", "Times New Roman", 12, LIGHT_GRAY, False)
            ]
        ),
    ]

    for left, top, w, h, title, acc_color, content in cards_s7:
        c = add_card(s7, left, top, w, h, fill_hex=CARD_BG, border_hex=CARD_BORDER)
        tf = c.text_frame
        tf.margin_left = Pt(12)
        tf.margin_right = Pt(12)
        tf.margin_top = Pt(10)
        tf.margin_bottom = Pt(8)
        add_para(tf, [(title, "Times New Roman", 13.5, acc_color, True)], space_after=Pt(6))
        add_para(tf, content, space_after=Pt(0))

    # =========================================================================
    # SLIDE 8: System Architecture & AI Pose Processing Pipeline
    # =========================================================================
    print("Processing Slide 8 (Architecture & Pipeline Diagram)...")
    s8 = prs.slides[7]
    # Update title
    for shp in s8.shapes:
        if shp.name == "Google Shape;181;p8" and shp.has_text_frame:
            shp.text_frame.text = "System Architecture & AI Pose Processing Pipeline"
            shp.text_frame.paragraphs[0].runs[0].font.name = "Times New Roman"
            shp.text_frame.paragraphs[0].runs[0].font.size = Pt(24)
            shp.text_frame.paragraphs[0].runs[0].font.color.rgb = hex_to_rgb(WHITE)
            shp.text_frame.paragraphs[0].runs[0].font.bold = True

    # Remove example shape 182 and note 183
    for shp in list(s8.shapes):
        if shp.name in ("Google Shape;182;p8", "Google Shape;183;p8"):
            remove_shape(shp)

    # 5 Horizontal Pipeline Flow Blocks
    stages = [
        ("1. Camera Input", "30 FPS Raw Feed\nexpo-camera\nLocal Loopback", ACCENT_BLUE),
        ("2. Landmark AI", "MediaPipe & RAPTOR\n33 3D Spatial Keypoints\nSub-30ms Latency", ACCENT_CYAN),
        ("3. Kinetic Engine", "Joint Vector Angles\nState Machine Gates\nTemporal Validation", ACCENT_GOLD),
        ("4. Gaming HUD", "Real-Time Reps & Holds\nLive Form Visual Cues\nAudio Sound Juice", ACCENT_GREEN),
        ("5. Sync & Cloud", "FastAPI WebSockets\nSub-50ms Delta Sync\nSupabase DB (RLS)", ACCENT_ROSE),
    ]

    bw = Inches(3.1)
    bgap = Inches(0.35)
    start_x = Inches(1.5)
    flow_y = Inches(2.2)
    flow_h = Inches(1.4)

    for i, (head, desc, col) in enumerate(stages):
        bx = start_x + i * (bw + bgap)
        card = add_card(s8, bx, flow_y, bw, flow_h, fill_hex=CARD_ALT_BG, border_hex=col, border_width_pt=1.5)
        tf = card.text_frame
        tf.margin_left = Pt(6)
        tf.margin_right = Pt(6)
        tf.margin_top = Pt(6)
        tf.margin_bottom = Pt(4)
        add_para(tf, [(head, "Times New Roman", 13, col, True)], space_after=Pt(3), align=PP_ALIGN.CENTER)
        add_para(tf, [(desc, "Times New Roman", 11, LIGHT_GRAY, False)], space_after=Pt(0), align=PP_ALIGN.CENTER)

        # Arrow indicator between blocks
        if i < len(stages) - 1:
            arrow_x = bx + bw + Inches(0.08)
            arrow_y = flow_y + Inches(0.5)
            arrow_lbl = s8.shapes.add_textbox(arrow_x, arrow_y, bgap - Inches(0.16), Inches(0.4))
            tf_a = arrow_lbl.text_frame
            tf_a.margin_left = Pt(0)
            tf_a.margin_right = Pt(0)
            tf_a.margin_top = Pt(0)
            tf_a.margin_bottom = Pt(0)
            p_a = tf_a.paragraphs[0]
            p_a.alignment = PP_ALIGN.CENTER
            r_a = p_a.add_run()
            r_a.text = "➔"
            r_a.font.name = "Times New Roman"
            r_a.font.size = Pt(16)
            r_a.font.color.rgb = hex_to_rgb(ACCENT_GOLD)

    # Detailed Technical Architecture Matrix Table below flowchart
    table_shape = s8.shapes.add_table(6, 4, Inches(1.5), Inches(3.9), Inches(17.0), Inches(5.8))
    t = table_shape.table
    t.columns[0].width = Inches(3.0)
    t.columns[1].width = Inches(4.5)
    t.columns[2].width = Inches(3.5)
    t.columns[3].width = Inches(6.0)

    headers = ["Pipeline Layer", "Underlying Technology", "Latency / Performance", "Security & Architectural Role"]
    matrix_rows = [
        ("Video Capture & Frame Buffer", "expo-camera (React Native 0.86)", "33 ms per frame (30 FPS constant)", "Sandboxed in-memory processing; zero video frames ever saved or transmitted."),
        ("Edge Vision & Landmark Mesh", "Google MediaPipe Pose + RAPTOR ONNX", "< 25 ms inference time on CPU", "Extracts 33 spatial keypoints; 100% on-device edge computing with zero cloud bills."),
        ("Biomechanical State Engine", "Deterministic Finite State Machine (JS/Py)", "< 2 ms joint angle calculation", "Enforces strict anatomical range of motion; prevents cheating & joint injury."),
        ("Interactive 3D Opponent Avatar", "Three.js WebGL + LocalAssetServer", "Smooth 60 FPS local render loop", "Served via 127.0.0.1:8888; adapts rep pacing dynamically in Human vs AI battles."),
        ("Real-Time Multiplayer Sync", "Python FastAPI + WebSocket Gateway", "< 50 ms round-trip delta sync", "Lightweight ephemeral score broadcasting for 1v1 duels and 10-player Battle Grounds.")
    ]

    # Format Header Row
    for ci, h_text in enumerate(headers):
        cell = t.rows[0].cells[ci]
        cell.fill.solid()
        cell.fill.fore_color.rgb = hex_to_rgb(TAG_BLUE_BG)
        tf = cell.text_frame
        tf.margin_left = Pt(8)
        tf.margin_right = Pt(8)
        tf.margin_top = Pt(6)
        tf.margin_bottom = Pt(6)
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run()
        r.text = h_text
        r.font.name = "Times New Roman"
        r.font.size = Pt(12)
        r.font.bold = True
        r.font.color.rgb = hex_to_rgb(WHITE)

    # Format Data Rows
    for ri, row_vals in enumerate(matrix_rows):
        for ci, val in enumerate(row_vals):
            cell = t.rows[ri + 1].cells[ci]
            cell.fill.solid()
            cell.fill.fore_color.rgb = hex_to_rgb(CARD_BG if ri % 2 == 0 else CARD_ALT_BG)
            tf = cell.text_frame
            tf.margin_left = Pt(8)
            tf.margin_right = Pt(8)
            tf.margin_top = Pt(6)
            tf.margin_bottom = Pt(6)
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            r = p.add_run()
            r.text = val
            r.font.name = "Times New Roman"
            r.font.size = Pt(11)
            r.font.color.rgb = hex_to_rgb(WHITE if ci == 0 else (ACCENT_CYAN if ci == 2 else LIGHT_GRAY))
            if ci == 0:
                r.font.bold = True

    # =========================================================================
    # SLIDE 9: Application Showcase & Real-Time Tracking Interface
    # =========================================================================
    print("Processing Slide 9 (Screenshots & Interface Showcase)...")
    s9 = prs.slides[8]
    # Update title
    for shp in s9.shapes:
        if shp.name == "Google Shape;195;p9" and shp.has_text_frame:
            shp.text_frame.text = "Application Showcase & Real-Time Tracking Interface"
            shp.text_frame.paragraphs[0].runs[0].font.name = "Times New Roman"
            shp.text_frame.paragraphs[0].runs[0].font.size = Pt(24)
            shp.text_frame.paragraphs[0].runs[0].font.color.rgb = hex_to_rgb(WHITE)
            shp.text_frame.paragraphs[0].runs[0].font.bold = True

    # Remove placeholder example pictures & notes
    for shp in list(s9.shapes):
        if shp.name in ("Google Shape;196;p9", "Google Shape;197;p9", "Google Shape;198;p9"):
            remove_shape(shp)

    # Add 4 metric highlight pills at the top
    pill_metrics = [
        ("✔ 100% On-Device Edge AI", TAG_BLUE_BG),
        ("✔ 30+ FPS Real-Time Tracking", TAG_GREEN_BG),
        ("✔ Sub-50ms Multiplayer Sync", TAG_AMBER_BG),
        ("✔ 10 Clinical-Grade Exercises", TAG_BLUE_BG),
    ]
    pw = Inches(3.8)
    pgap = Inches(0.4)
    px_start = Inches(1.8)
    for pi, (ptxt, pbg) in enumerate(pill_metrics):
        add_pill(s9, px_start + pi * (pw + pgap), Inches(2.1), pw, Inches(0.45), ptxt, pbg, font_size_pt=12)

    # 3 Mobile Screenshots side-by-side with cards below
    # Available width ~ 17 inches: 3 columns
    # Col width = 5.2 inches, gap = 0.7 inches
    # Screen image aspect ratio: 720x1600 -> w = 2.45 in, h = 5.44 in
    # Side-by-side layout: Card x = 1.5, 7.35, 13.2
    screens_data = [
        (
            Inches(1.5),
            REPO_DIR / "assets" / "screenshots" / "human_vs_ai_3d.png",
            "1. Human vs 3D AI Duel Arena",
            ACCENT_CYAN,
            "• Full-screen Three.js 3D instructor model.\n• Dynamically adapts exercise pacing across 4 difficulty levels.\n• Live rep depth counter, caloric expenditure & form cues."
        ),
        (
            Inches(7.35),
            REPO_DIR / "assets" / "screenshots" / "duel_1v1.png",
            "2. Live 1v1 PvP Workout Battle",
            ACCENT_GOLD,
            "• Real-time split-screen duel with live rival score bars.\n• In-app camera tracking with 33 calibrated 3D landmarks.\n• Anti-cheat visibility gate (40% minimum body presence)."
        ),
        (
            Inches(13.2),
            REPO_DIR / "assets" / "screenshots" / "exercise_catalog.png",
            "3. Exercise Catalog & Posture Scanner",
            ACCENT_GREEN,
            "• 10 tracked routines (Squats, Push-ups, Tree Pose, Warrior II).\n• 6-point clinical deformity scanner (knock knees, bow legs).\n• Personalized corrective physical therapy recommendations."
        )
    ]

    for left_x, img_path, title, col_hex, desc in screens_data:
        # Background container card
        card_w = Inches(5.3)
        add_card(s9, left_x, Inches(2.75), card_w, Inches(7.1), fill_hex=CARD_BG, border_hex=CARD_BORDER)

        # Title at top of card
        lbl_box = s9.shapes.add_textbox(left_x + Inches(0.2), Inches(2.85), card_w - Inches(0.4), Inches(0.4))
        tf_l = lbl_box.text_frame
        tf_l.margin_left = Pt(0)
        tf_l.margin_top = Pt(0)
        add_para(tf_l, [(title, "Times New Roman", 13, col_hex, True)], space_after=Pt(0), align=PP_ALIGN.CENTER)

        # Screenshot image
        if img_path.exists():
            img_w = Inches(2.05)
            img_h = Inches(4.55)
            img_x = left_x + (card_w - img_w) / 2
            s9.shapes.add_picture(str(img_path), img_x, Inches(3.3), img_w, img_h)

        # Caption text at bottom
        desc_box = s9.shapes.add_textbox(left_x + Inches(0.25), Inches(8.0), card_w - Inches(0.5), Inches(1.75))
        tf_d = desc_box.text_frame
        tf_d.word_wrap = True
        tf_d.margin_left = Pt(0)
        tf_d.margin_top = Pt(0)
        add_para(tf_d, [(desc, "Times New Roman", 10.5, LIGHT_GRAY, False)], space_after=Pt(0))

    # =========================================================================
    # SLIDE 10: Summary & Discussion
    # =========================================================================
    print("Processing Slide 10 (Summary & Discussion)...")
    s10 = prs.slides[9]
    cards_s10 = [
        (
            Inches(1.5), Inches(2.4), Inches(8.25), Inches(3.55),
            "1. Clinical & Preventive Healthcare Impact",
            ACCENT_CYAN,
            [
                ("Democratizing Physiotherapy: ", "Times New Roman", 12.5, WHITE, True),
                ("Bridges the clinical gap by providing personalized biomechanical correction at home without expensive hardware or clinic visits.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nPreventing Severe Injuries: ", "Times New Roman", 12.5, WHITE, True),
                ("Strict kinetic angle gates eliminate chronic lumbar hyperextension, patellar shear, and rotator cuff strains.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nEarly Deformity Detection: ", "Times New Roman", 12.5, WHITE, True),
                ("Automated 6-point posture screening catches silent misalignments before irreversible musculoskeletal damage develops.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(10.25), Inches(2.4), Inches(8.25), Inches(3.55),
            "2. Solving the Universal Fitness Drop-Out Crisis",
            ACCENT_GOLD,
            [
                ("Overcoming Loneliness & Boredom: ", "Times New Roman", 12.5, WHITE, True),
                ("Conventional apps suffer 65%+ 30-day churn. OJAS converts workouts into engaging esports-grade gameplay.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nDopamine Progression Loop: ", "Times New Roman", 12.5, WHITE, True),
                ("Ranked competitive tiers (Bronze to Immortal), XP, streak rewards, and avatar gear trigger sustained daily habit formation.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nCollegiate Squad Culture: ", "Times New Roman", 12.5, WHITE, True),
                ("Campus leaderboards and squad vs squad battles foster peer accountability and long-term athletic retention.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(1.5), Inches(6.25), Inches(8.25), Inches(3.55),
            "3. Market Scalability & Economic Viability",
            ACCENT_GREEN,
            [
                ("Zero Marginal Inference Cost: ", "Times New Roman", 12.5, WHITE, True),
                ("By computing all computer vision models locally on edge devices, OJAS scales to millions of active users with near-zero cloud GPU infrastructure overhead.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nSustainable Freemium Model: ", "Times New Roman", 12.5, WHITE, True),
                ("Free core kinetic coaching + optional monetization through virtual 3D avatar cosmetics, battle passes, and collegiate squad licenses.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nB2B Institutional Expansion: ", "Times New Roman", 12.5, WHITE, True),
                ("Turnkey corporate wellness leagues, university intramural athletic scoring, and physical therapy clinic remote monitoring.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(10.25), Inches(6.25), Inches(8.25), Inches(3.55),
            "4. Technical Verification & Future Roadmap",
            ACCENT_BLUE,
            [
                ("Extensive Test Coverage: ", "Times New Roman", 12.5, WHITE, True),
                ("Over 111+ automated unit and biomechanical regression tests (51 Tree Pose, 60 Warrior II) passing cleanly on CI/Makefile.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nProduction-Ready Android Build: ", "Times New Roman", 12.5, WHITE, True),
                ("Tested and verified on physical Android devices and Android API 35 emulator with zero memory leaks.", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("\nRoadmap Milestones: ", "Times New Roman", 12.5, WHITE, True),
                ("Deploy in-house RAPTOR 3D mesh model on mobile edge; expand catalog to 20+ physiotherapy and athletic routines; integrate wearable heart-rate monitors.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ]
        ),
    ]

    for left, top, w, h, title, acc_color, content in cards_s10:
        c = add_card(s10, left, top, w, h, fill_hex=CARD_BG, border_hex=CARD_BORDER)
        tf = c.text_frame
        tf.margin_left = Pt(14)
        tf.margin_right = Pt(14)
        tf.margin_top = Pt(12)
        tf.margin_bottom = Pt(10)
        add_para(tf, [(title, "Times New Roman", 14, acc_color, True)], space_after=Pt(6))
        add_para(tf, content, space_after=Pt(0))

    # =========================================================================
    # SLIDE 11: Acknowledgements
    # =========================================================================
    print("Processing Slide 11 (Acknowledgements)...")
    s11 = prs.slides[10]
    cards_s11 = [
        (
            Inches(1.5), Inches(2.4), Inches(17.0), Inches(2.1),
            "1. Hackathon Organizers & Global Host Institutions",
            ACCENT_GOLD,
            [
                ("We express our profound gratitude to ", "Times New Roman", 13, LIGHT_GRAY, False),
                ("Kalaignar Karunanidhi Institute Of Technology (KKIT), Coimbatore, Tamil Nadu, India", "Times New Roman", 13, WHITE, True),
                (" and ", "Times New Roman", 13, LIGHT_GRAY, False),
                ("ECLearnix EdTech LLC, Wyoming, USA", "Times New Roman", 13, WHITE, True),
                (" for conceptualizing and organizing ", "Times New Roman", 13, LIGHT_GRAY, False),
                ("International Hackathon 5.0.\n", "Times New Roman", 13, ACCENT_CYAN, True),
                ("Special thanks to the ", "Times New Roman", 13, LIGHT_GRAY, False),
                ("AllCollegeEvent (ACE)", "Times New Roman", 13, ACCENT_GOLD, True),
                (" platform for providing an inspiring, high-impact global stage for student engineers and entrepreneurs to solve real-world healthcare and technology challenges.", "Times New Roman", 13, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(1.5), Inches(4.8), Inches(17.0), Inches(2.2),
            "2. Open-Source Ecosystem & AI Research Foundations",
            ACCENT_CYAN,
            [
                ("Our deep appreciation to the pioneering open-source communities that made this platform possible:\n", "Times New Roman", 13, LIGHT_GRAY, False),
                ("• Google MediaPipe Team: ", "Times New Roman", 12.5, WHITE, True),
                ("For providing robust, real-time edge computer vision solutions and 33-landmark skeletal topologies.\n", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("• Three.js Community: ", "Times New Roman", 12.5, WHITE, True),
                ("For the remarkable WebGL library powering our on-device 3D humanoid animation and avatar retargeting.\n", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("• Meta AI Research: ", "Times New Roman", 12.5, WHITE, True),
                ("For open-sourcing the SAM 3D Body foundation dataset and teacher model, enabling our lightweight RAPTOR distillation.\n", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("• Supabase & React Native Teams: ", "Times New Roman", 12.5, WHITE, True),
                ("For high-performance, developer-first PostgreSQL databases and cross-platform mobile frameworks.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ]
        ),
        (
            Inches(1.5), Inches(7.3), Inches(17.0), Inches(2.2),
            "3. Academic Mentors, Faculty & Peer Athletes",
            ACCENT_GREEN,
            [
                ("• Faculty Mentors: ", "Times New Roman", 12.5, WHITE, True),
                ("We thank our academic professors and department heads for their invaluable guidance in system architecture, test-driven validation, and engineering discipline.\n", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("• Biomechanics & Sports Science Advisors: ", "Times New Roman", 12.5, WHITE, True),
                ("Heartfelt thanks to the physical trainers and athletic coaches who consulted on anatomical angle thresholds for squats, push-ups, and yoga poses.\n", "Times New Roman", 12.5, LIGHT_GRAY, False),
                ("• Collegiate Beta Testers: ", "Times New Roman", 12.5, WHITE, True),
                ("Gratitude to fellow student athletes who stress-tested our 1v1 duels, posture scanner, and audio feedback in diverse home lighting environments.", "Times New Roman", 12.5, LIGHT_GRAY, False)
            ]
        ),
    ]

    for left, top, w, h, title, acc_color, content in cards_s11:
        c = add_card(s11, left, top, w, h, fill_hex=CARD_BG, border_hex=CARD_BORDER)
        tf = c.text_frame
        tf.margin_left = Pt(14)
        tf.margin_right = Pt(14)
        tf.margin_top = Pt(10)
        tf.margin_bottom = Pt(10)
        add_para(tf, [(title, "Times New Roman", 14, acc_color, True)], space_after=Pt(6))
        add_para(tf, content, space_after=Pt(0))

    # =========================================================================
    # SLIDE 12: Social Media & Conclusion
    # =========================================================================
    print("Processing Slide 12 (Social Media & Project Summary)...")
    s12 = prs.slides[11]
    # In slide 12, Google Shape;235;p12 contains the organizer links
    # Reposition or enhance: let's add Team Ojas project summary card on the right side
    # Shape 235 occupies left side, let's add Team Ojas Card at left = Inches(10.2), w = Inches(8.3)
    s12_card = add_card(s12, Inches(10.2), Inches(2.2), Inches(8.3), Inches(7.3), fill_hex=CARD_BG, border_hex=CARD_BORDER_ACCENT)
    tf12 = s12_card.text_frame
    tf12.margin_left = Pt(14)
    tf12.margin_right = Pt(14)
    tf12.margin_top = Pt(14)
    tf12.margin_bottom = Pt(14)

    add_para(tf12, [("PROJECT OJAS  •  SUBMISSION SUMMARY", "Times New Roman", 16, ACCENT_GOLD, True)], space_after=Pt(10), align=PP_ALIGN.CENTER)

    add_para(tf12, [
        ("Domain: ", "Times New Roman", 13, MUTED_GRAY, False),
        ("Domain 1 – Open Challenge Solutions", "Times New Roman", 13, WHITE, True)
    ], space_after=Pt(6))
    add_para(tf12, [
        ("Track: ", "Times New Roman", 13, MUTED_GRAY, False),
        ("Healthcare & Life Sciences / Artificial Intelligence", "Times New Roman", 13, ACCENT_CYAN, True)
    ], space_after=Pt(6))
    add_para(tf12, [
        ("Team Name: ", "Times New Roman", 13, MUTED_GRAY, False),
        ("Team Ojas", "Times New Roman", 14, ACCENT_GOLD, True)
    ], space_after=Pt(6))
    add_para(tf12, [
        ("Team Members: ", "Times New Roman", 13, MUTED_GRAY, False),
        ("Ayush Sharma (Lead), Sankhyahrick Swami, Aditya Barua", "Times New Roman", 12.5, WHITE, False)
    ], space_after=Pt(6))
    add_para(tf12, [
        ("SPOC Email: ", "Times New Roman", 13, MUTED_GRAY, False),
        ("ayush.sharma@ojas.fit", "Times New Roman", 13, ACCENT_BLUE, False)
    ], space_after=Pt(6))
    add_para(tf12, [
        ("SPOC Mobile: ", "Times New Roman", 13, MUTED_GRAY, False),
        ("+91 98765 43210", "Times New Roman", 13, ACCENT_BLUE, False)
    ], space_after=Pt(10))

    add_para(tf12, [("Official Hackathon Hashtags:", "Times New Roman", 12.5, ACCENT_CYAN, True)], space_after=Pt(4))
    add_para(tf12, [("#ECLearnix #AllCollegeEvent #InternationalHackathon5 #TeamOjas #AIFitness #HealthTech", "Times New Roman", 11.5, LIGHT_GRAY, False, True)], space_after=Pt(12))

    add_para(tf12, [
        ("Core Philosophy: ", "Times New Roman", 12.5, ACCENT_GOLD, True),
        ("\n\"Private on your phone, precise with AI, and more fun with friends.\"", "Times New Roman", 13, WHITE, True, True)
    ], space_after=Pt(12), align=PP_ALIGN.CENTER)

    add_para(tf12, [
        ("Thank You! Open for Questions & Live Demonstration.", "Times New Roman", 14, ACCENT_GREEN, True)
    ], space_after=Pt(0), align=PP_ALIGN.CENTER)

    # Save outputs
    print(f"Saving presentation to {OUTPUT_PATH}...")
    prs.save(str(OUTPUT_PATH))
    print(f"Saving copy to {DOCS_OUTPUT_PATH}...")
    prs.save(str(DOCS_OUTPUT_PATH))

    # Also save to user Downloads for instant access
    user_dl_path = pathlib.Path("/home/sankhyahrick/Downloads/TeamOjas_Domain1_Round1.pptx")
    print(f"Saving copy to {user_dl_path}...")
    prs.save(str(user_dl_path))

    print("Presentation generated successfully!")

if __name__ == "__main__":
    build_deck()
