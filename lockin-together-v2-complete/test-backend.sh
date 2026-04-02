#!/bin/bash

# ============================================================
# LockinTogether Backend — Complete Testing Script v2
# ============================================================
#
# HOW TO USE:
# 1. Make sure your emulator is running: firebase emulators:start
# 2. Open a SECOND terminal
# 3. Run this script: bash test-backend.sh
#
# The script clears all emulator data first, so you get a
# clean test every time. Just re-run whenever you want.
#
# IMPORTANT: Update PROJECT_ID below to match your emulator output.
# ============================================================

PROJECT_ID="demo-no-project"  # ← Change this if yours is different
REGION="asia-southeast1"
BASE="http://127.0.0.1:5001/${PROJECT_ID}/${REGION}"
AUTH_URL="http://127.0.0.1:9099"
FIRESTORE_URL="http://127.0.0.1:8080"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

check_response() {
  local test_name="$1"
  local response="$2"
  local expected="$3"

  if echo "$response" | grep -qF "$expected"; then
    echo -e "  ${GREEN}✔ PASS${NC}: $test_name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${RED}✘ FAIL${NC}: $test_name"
    echo -e "    Expected to find: ${expected}"
    echo -e "    Got: ${response}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo ""
echo "============================================================"
echo " LockinTogether Backend Test Suite v2"
echo " Base URL: ${BASE}"
echo "============================================================"
echo ""

# ──────────────────────────────────────────────────────────────
# RESET: Clear all emulator data for a fresh test
# ──────────────────────────────────────────────────────────────

echo -e "${BLUE}▶ Resetting emulator data...${NC}"
curl -s -X DELETE "${FIRESTORE_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents" > /dev/null 2>&1
curl -s -X DELETE "${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts" > /dev/null 2>&1
curl -s -X DELETE "http://127.0.0.1:9199/storage/v1/b/${PROJECT_ID}.appspot.com/o" > /dev/null 2>&1
echo -e "  ${GREEN}✔${NC} Emulator data cleared — starting fresh"
echo ""
sleep 1

# ──────────────────────────────────────────────────────────────
# PHASE 1: Authentication & User Profiles
# ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}▶ Phase 1: Authentication & User Profiles${NC}"
echo ""

echo "  Creating test user (alice)..."
SIGNUP_RESPONSE=$(curl -s -X POST \
  "${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123","returnSecureToken":true}')

TOKEN=$(echo "$SIGNUP_RESPONSE" | grep -o '"idToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "  ${RED}✘ FATAL: Could not get auth token. Is the emulator running?${NC}"
  echo "  Response: $SIGNUP_RESPONSE"
  exit 1
fi
echo -e "  ${GREEN}✔ PASS${NC}: Alice created and token obtained"

echo "  Creating second test user (bob)..."
SIGNUP2_RESPONSE=$(curl -s -X POST \
  "${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"password123","returnSecureToken":true}')
TOKEN2=$(echo "$SIGNUP2_RESPONSE" | grep -o '"idToken":"[^"]*"' | cut -d'"' -f4)
check_response "Bob created and token obtained" "$SIGNUP2_RESPONSE" "idToken"

echo "  Waiting 3s for onUserCreate trigger..."
sleep 3

echo ""
PROFILE_RESPONSE=$(curl -s -X GET "${BASE}/getUserProfile" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "getUserProfile returns own profile" "$PROFILE_RESPONSE" "alice@example.com"

UPDATE_PROFILE_RESPONSE=$(curl -s -X PATCH "${BASE}/updateUserProfile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"displayName":"Alice Johnson"}')
check_response "updateUserProfile succeeds" "$UPDATE_PROFILE_RESPONSE" "Profile updated successfully"

PROFILE_AFTER=$(curl -s -X GET "${BASE}/getUserProfile" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "Profile shows updated name" "$PROFILE_AFTER" "Alice Johnson"

SEARCH_RESPONSE=$(curl -s -X GET "${BASE}/searchUserByEmail?email=bob@example.com" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "searchUserByEmail finds bob" "$SEARCH_RESPONSE" "bob@example.com"
BOB_USER_ID=$(echo "$SEARCH_RESPONSE" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)

NO_AUTH_RESPONSE=$(curl -s -X GET "${BASE}/getUserProfile")
check_response "Request without token is rejected" "$NO_AUTH_RESPONSE" "Missing or malformed"

echo ""
echo -e "  ${BLUE}► Check: Firestore → 'users' — 2 documents (alice, bob)${NC}"
read -p "  Press Enter to continue to Phase 2..."
echo ""

# ──────────────────────────────────────────────────────────────
# PHASE 2: Board Management
# ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}▶ Phase 2: Board Management${NC}"
echo ""

CREATE_BOARD_RESPONSE=$(curl -s -X POST "${BASE}/createBoard" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"title":"Sprint Board","description":"Main development board","columns":["To-Do","In-Progress","Review","Done"]}')
check_response "createBoard succeeds" "$CREATE_BOARD_RESPONSE" "Board created successfully"
BOARD_ID=$(echo "$CREATE_BOARD_RESPONSE" | grep -o '"boardId":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "    Board ID: ${BOARD_ID}"

if [ -z "$BOARD_ID" ]; then
  echo -e "  ${RED}✘ FATAL: Could not extract boardId${NC}"
  exit 1
fi

GET_BOARDS_RESPONSE=$(curl -s -X GET "${BASE}/getBoards" -H "Authorization: Bearer ${TOKEN}")
check_response "getBoards returns the board" "$GET_BOARDS_RESPONSE" "Sprint Board"

GET_BOARD_RESPONSE=$(curl -s -X GET "${BASE}/getBoardById?boardId=${BOARD_ID}" -H "Authorization: Bearer ${TOKEN}")
check_response "getBoardById returns board details" "$GET_BOARD_RESPONSE" "Sprint Board"
check_response "getBoardById includes members list" "$GET_BOARD_RESPONSE" "members"

ADD_MEMBER_RESPONSE=$(curl -s -X POST "${BASE}/addBoardMember" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"email\":\"bob@example.com\",\"role\":\"member\"}")
check_response "addBoardMember adds bob" "$ADD_MEMBER_RESPONSE" "added to the board"

BOB_BOARDS_RESPONSE=$(curl -s -X GET "${BASE}/getBoards" -H "Authorization: Bearer ${TOKEN2}")
check_response "Bob can see the board" "$BOB_BOARDS_RESPONSE" "Sprint Board"

UPDATE_BOARD_RESPONSE=$(curl -s -X PATCH "${BASE}/updateBoard" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"title\":\"Sprint Board v2\"}")
check_response "updateBoard succeeds" "$UPDATE_BOARD_RESPONSE" "Board updated successfully"

DUPE_MEMBER_RESPONSE=$(curl -s -X POST "${BASE}/addBoardMember" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"email\":\"bob@example.com\"}")
check_response "Duplicate member is rejected" "$DUPE_MEMBER_RESPONSE" "already a member"

BOB_UPDATE_RESPONSE=$(curl -s -X PATCH "${BASE}/updateBoard" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN2}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"title\":\"Hacked Title\"}")
check_response "Member cannot update board" "$BOB_UPDATE_RESPONSE" "requires one of these roles"

echo ""
echo -e "  ${BLUE}► Check: 'boards' (1), 'boardMembers' (2), 'activityLog' entries${NC}"
read -p "  Press Enter to continue to Phase 3..."
echo ""

# ──────────────────────────────────────────────────────────────
# PHASE 3: Task Management
# ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}▶ Phase 3: Task Management${NC}"
echo ""

CREATE_TASK1_RESPONSE=$(curl -s -X POST "${BASE}/createTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"title\":\"Set up CI/CD\",\"description\":\"Configure GitHub Actions\",\"status\":\"To-Do\"}")
check_response "createTask 1 succeeds" "$CREATE_TASK1_RESPONSE" "Task created successfully"
TASK1_ID=$(echo "$CREATE_TASK1_RESPONSE" | grep -o '"taskId":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "    Task 1 ID: ${TASK1_ID}"

CREATE_TASK2_RESPONSE=$(curl -s -X POST "${BASE}/createTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"title\":\"Design database schema\",\"status\":\"To-Do\"}")
check_response "createTask 2 succeeds" "$CREATE_TASK2_RESPONSE" "Task created successfully"
TASK2_ID=$(echo "$CREATE_TASK2_RESPONSE" | grep -o '"taskId":"[^"]*"' | head -1 | cut -d'"' -f4)

CREATE_TASK3_RESPONSE=$(curl -s -X POST "${BASE}/createTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"title\":\"Write unit tests\",\"status\":\"In-Progress\"}")
check_response "createTask 3 succeeds" "$CREATE_TASK3_RESPONSE" "Task created successfully"
TASK3_ID=$(echo "$CREATE_TASK3_RESPONSE" | grep -o '"taskId":"[^"]*"' | head -1 | cut -d'"' -f4)

GET_TASKS_RESPONSE=$(curl -s -X GET "${BASE}/getTasksByBoard?boardId=${BOARD_ID}" -H "Authorization: Bearer ${TOKEN}")
check_response "getTasksByBoard returns tasks" "$GET_TASKS_RESPONSE" "Set up CI/CD"
check_response "getTasksByBoard has all 3 tasks" "$GET_TASKS_RESPONSE" "Write unit tests"

BAD_COLUMN_RESPONSE=$(curl -s -X POST "${BASE}/createTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"title\":\"Bad Task\",\"status\":\"Invalid-Column\"}")
check_response "Invalid column is rejected" "$BAD_COLUMN_RESPONSE" "Invalid column"

UPDATE_TASK_RESPONSE=$(curl -s -X PATCH "${BASE}/updateTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"taskId\":\"${TASK1_ID}\",\"boardId\":\"${BOARD_ID}\",\"title\":\"Set up CI/CD Pipeline\",\"description\":\"Configure GitHub Actions for auto-deploy\"}")
check_response "updateTask succeeds" "$UPDATE_TASK_RESPONSE" "Task updated successfully"

echo ""
echo -e "  ${YELLOW}★ Testing moveTask (cross-column drag-and-drop)...${NC}"
MOVE_TASK_RESPONSE=$(curl -s -X PATCH "${BASE}/moveTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"taskId\":\"${TASK1_ID}\",\"boardId\":\"${BOARD_ID}\",\"newStatus\":\"In-Progress\",\"newColumnIndex\":0}")
check_response "moveTask cross-column succeeds" "$MOVE_TASK_RESPONSE" "Task moved successfully"

TASKS_AFTER_MOVE=$(curl -s -X GET "${BASE}/getTasksByBoard?boardId=${BOARD_ID}" -H "Authorization: Bearer ${TOKEN}")
check_response "Task 1 is now in In-Progress" "$TASKS_AFTER_MOVE" "In-Progress"

REORDER_RESPONSE=$(curl -s -X PATCH "${BASE}/moveTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"taskId\":\"${TASK1_ID}\",\"boardId\":\"${BOARD_ID}\",\"newStatus\":\"In-Progress\",\"newColumnIndex\":1}")
check_response "moveTask same-column reorder succeeds" "$REORDER_RESPONSE" "Task moved successfully"

ASSIGN_RESPONSE=$(curl -s -X PATCH "${BASE}/assignTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"taskId\":\"${TASK1_ID}\",\"boardId\":\"${BOARD_ID}\",\"assignedTo\":\"${BOB_USER_ID}\"}")
check_response "assignTask succeeds" "$ASSIGN_RESPONSE" "Task assignment updated"

UNASSIGN_RESPONSE=$(curl -s -X PATCH "${BASE}/assignTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"taskId\":\"${TASK1_ID}\",\"boardId\":\"${BOARD_ID}\",\"assignedTo\":null}")
check_response "Unassign task succeeds" "$UNASSIGN_RESPONSE" "Task assignment updated"

DELETE_TASK_RESPONSE=$(curl -s -X DELETE "${BASE}/deleteTask" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"taskId\":\"${TASK2_ID}\",\"boardId\":\"${BOARD_ID}\"}")
check_response "deleteTask succeeds" "$DELETE_TASK_RESPONSE" "Task deleted successfully"

TASKS_AFTER_DELETE=$(curl -s -X GET "${BASE}/getTasksByBoard?boardId=${BOARD_ID}" -H "Authorization: Bearer ${TOKEN}")
if echo "$TASKS_AFTER_DELETE" | grep -qF "Design database schema"; then
  echo -e "  ${RED}✘ FAIL${NC}: Deleted task still appears"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo -e "  ${GREEN}✔ PASS${NC}: Deleted task no longer appears"
  PASS_COUNT=$((PASS_COUNT + 1))
fi

echo ""
echo -e "  ${BLUE}► Check: 'tasks' (2 remaining), 'activityLog' has move/assign/delete entries${NC}"
read -p "  Press Enter to continue to Phase 4..."
echo ""

# ──────────────────────────────────────────────────────────────
# PHASE 4: File Attachments
# ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}▶ Phase 4: File Attachments${NC}"
echo ""

echo "This is a test file for LockinTogether." > /tmp/test-attachment.txt

UPLOAD_RESPONSE=$(curl -s -X POST "${BASE}/uploadAttachment" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "boardId=${BOARD_ID}" -F "taskId=${TASK1_ID}" \
  -F "file=@/tmp/test-attachment.txt")
check_response "uploadAttachment succeeds" "$UPLOAD_RESPONSE" "File uploaded successfully"
check_response "uploadAttachment returns storageURL" "$UPLOAD_RESPONSE" "storageURL"
ATTACHMENT_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"attachmentId":"[^"]*"' | cut -d'"' -f4)
echo "    Attachment ID: ${ATTACHMENT_ID}"

GET_ATTACHMENTS_RESPONSE=$(curl -s -X GET \
  "${BASE}/getAttachmentsByTask?taskId=${TASK1_ID}&boardId=${BOARD_ID}" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "getAttachmentsByTask returns attachment" "$GET_ATTACHMENTS_RESPONSE" "test-attachment.txt"
check_response "Attachment has correct MIME type" "$GET_ATTACHMENTS_RESPONSE" "text/plain"

echo "Second test file." > /tmp/test-attachment-2.txt
UPLOAD2_RESPONSE=$(curl -s -X POST "${BASE}/uploadAttachment" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "boardId=${BOARD_ID}" -F "taskId=${TASK1_ID}" \
  -F "file=@/tmp/test-attachment-2.txt")
check_response "Second upload succeeds" "$UPLOAD2_RESPONSE" "File uploaded successfully"
ATTACHMENT2_ID=$(echo "$UPLOAD2_RESPONSE" | grep -o '"attachmentId":"[^"]*"' | cut -d'"' -f4)

GET_BOTH_RESPONSE=$(curl -s -X GET \
  "${BASE}/getAttachmentsByTask?taskId=${TASK1_ID}&boardId=${BOARD_ID}" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "Both attachments are listed" "$GET_BOTH_RESPONSE" "test-attachment-2.txt"

echo ""
echo -e "  ${BLUE}★ CHECK STORAGE NOW: http://127.0.0.1:4000/storage${NC}"
echo "    You should see 2 files under boards/${BOARD_ID}/tasks/${TASK1_ID}/"
echo ""
read -p "  Can you see the files in Storage? Press Enter to continue..."
echo ""

if [ -n "$ATTACHMENT_ID" ]; then
  DELETE_ATTACHMENT_RESPONSE=$(curl -s -X DELETE "${BASE}/deleteAttachment" \
    -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"attachmentId\":\"${ATTACHMENT_ID}\",\"boardId\":\"${BOARD_ID}\"}")
  check_response "deleteAttachment succeeds" "$DELETE_ATTACHMENT_RESPONSE" "Attachment deleted successfully"
fi

GET_AFTER_DELETE=$(curl -s -X GET \
  "${BASE}/getAttachmentsByTask?taskId=${TASK1_ID}&boardId=${BOARD_ID}" \
  -H "Authorization: Bearer ${TOKEN}")
if echo "$GET_AFTER_DELETE" | grep -qF "test-attachment-2.txt"; then
  echo -e "  ${GREEN}✔ PASS${NC}: Second attachment still exists after first deleted"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "  ${RED}✘ FAIL${NC}: Second attachment missing"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

rm -f /tmp/test-attachment.txt /tmp/test-attachment-2.txt

echo ""
read -p "  Press Enter to continue to Phase 5..."
echo ""

# ──────────────────────────────────────────────────────────────
# PHASE 5: Activity Log
# ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}▶ Phase 5: Activity Log${NC}"
echo ""

echo "  Waiting 2s for triggers to complete..."
sleep 2

ACTIVITY_RESPONSE=$(curl -s -X GET "${BASE}/getActivityLog?boardId=${BOARD_ID}" -H "Authorization: Bearer ${TOKEN}")
check_response "getActivityLog returns logs" "$ACTIVITY_RESPONSE" "logs"
check_response "Activity log has board_created" "$ACTIVITY_RESPONSE" "board_created"
check_response "Activity log has task_created" "$ACTIVITY_RESPONSE" "task_created"
check_response "Activity log has task_moved" "$ACTIVITY_RESPONSE" "task_moved"
check_response "Activity log has file_uploaded" "$ACTIVITY_RESPONSE" "file_uploaded"
check_response "Activity log enriches with userName" "$ACTIVITY_RESPONSE" "userName"

FILTERED_RESPONSE=$(curl -s -X GET \
  "${BASE}/getActivityLog?boardId=${BOARD_ID}&action=task_moved" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "Filtered log returns task_moved entries" "$FILTERED_RESPONSE" "task_moved"

PAGINATED_RESPONSE=$(curl -s -X GET \
  "${BASE}/getActivityLog?boardId=${BOARD_ID}&limit=2" \
  -H "Authorization: Bearer ${TOKEN}")
check_response "Paginated log returns hasMore flag" "$PAGINATED_RESPONSE" "hasMore"
check_response "Paginated log returns lastLogId" "$PAGINATED_RESPONSE" "lastLogId"

echo ""
read -p "  Press Enter to continue to cleanup..."
echo ""

# ──────────────────────────────────────────────────────────────
# CLEANUP: Member Removal & Board Deletion
# ──────────────────────────────────────────────────────────────

echo -e "${YELLOW}▶ Cleanup Tests: Member Removal & Board Deletion${NC}"
echo ""

REMOVE_MEMBER_RESPONSE=$(curl -s -X DELETE "${BASE}/removeBoardMember" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\",\"userId\":\"${BOB_USER_ID}\"}")
check_response "removeBoardMember succeeds" "$REMOVE_MEMBER_RESPONSE" "Member removed"

BOB_BOARDS_AFTER=$(curl -s -X GET "${BASE}/getBoards" -H "Authorization: Bearer ${TOKEN2}")
if echo "$BOB_BOARDS_AFTER" | grep -qF "Sprint Board"; then
  echo -e "  ${RED}✘ FAIL${NC}: Bob can still see the board after removal"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo -e "  ${GREEN}✔ PASS${NC}: Bob can no longer see the board"
  PASS_COUNT=$((PASS_COUNT + 1))
fi

DELETE_BOARD_RESPONSE=$(curl -s -X DELETE "${BASE}/deleteBoard" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"boardId\":\"${BOARD_ID}\"}")
check_response "deleteBoard succeeds" "$DELETE_BOARD_RESPONSE" "Board and all data deleted"

BOARDS_AFTER_DELETE=$(curl -s -X GET "${BASE}/getBoards" -H "Authorization: Bearer ${TOKEN}")
check_response "No boards remain after deletion" "$BOARDS_AFTER_DELETE" '"boards":[]'

echo ""

# ──────────────────────────────────────────────────────────────
# RESULTS
# ──────────────────────────────────────────────────────────────

echo "============================================================"
echo " TEST RESULTS"
echo "============================================================"
echo ""
echo -e "  ${GREEN}Passed: ${PASS_COUNT}${NC}"
echo -e "  ${RED}Failed: ${FAIL_COUNT}${NC}"
echo -e "  Total:  $((PASS_COUNT + FAIL_COUNT))"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "  ${GREEN}🎉 ALL TESTS PASSED — Backend is working correctly!${NC}"
else
  echo -e "  ${RED}⚠  Some tests failed. Check the output above for details.${NC}"
fi

echo ""
echo "  To run again: bash test-backend.sh"
echo "  (data resets automatically — no need to restart the emulator)"
echo ""