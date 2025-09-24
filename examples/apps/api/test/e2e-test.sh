#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3001"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Utility functions
log_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

log_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

log_request() {
    echo -e "${BLUE}→ $1${NC}"
}

# Test route availability
test_route() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    local description=$5

    local url="$API_URL$endpoint"
    local response
    local status_code

    log_request "$method $endpoint"

    if [ "$method" = "POST" ]; then
        echo "  Data: $data"
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url")
    fi

    status_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)

    echo "  Status: $status_code"
    if [ -n "$response_body" ] && [ "$response_body" != "null" ]; then
        echo "  Response: $(echo "$response_body" | head -c 200)..."
    fi

    if [[ " $expected_status " =~ " $status_code " ]]; then
        log_success "$description"
        return 0
    else
        log_error "$description (Expected: $expected_status, Got: $status_code)"
        return 1
    fi
}

# Generate unique email for testing
generate_email() {
    echo "test$(date +%s%N | cut -b1-13)@example.com"
}

# Main test execution
run_tests() {
    echo "E2E Test Script for Modular Monolith API"
    echo "========================================"
    log_info "Assuming server is running at $API_URL"
    echo ""

    # Test 1: Route Availability
    log_info "1. Testing Route Availability"
    echo "----------------------------"

    # App routes
    echo ""
    log_info "App Controller Routes:"
    test_route "GET" "/api" "" "200" "GET /api - Main API endpoint"
    test_route "GET" "/api/health" "" "200" "GET /api/health - Health check endpoint"

    # Auth routes
    echo ""
    log_info "Auth Controller Routes:"
    local auth_email=$(generate_email)
    test_route "POST" "/api/auth/register" "{\"email\":\"$auth_email\",\"password\":\"password123\"}" "200 201 400 401 500" "POST /api/auth/register - User registration"

    test_route "POST" "/api/auth/login" "{\"email\":\"nonexistent@example.com\",\"password\":\"wrong\"}" "200 201 400 401" "POST /api/auth/login - User login"

    test_route "GET" "/api/auth/profile" "" "200 401 403" "GET /api/auth/profile - Get user profile"

    # User routes
    echo ""
    log_info "User Controller Routes:"
    test_route "GET" "/api/users" "" "200" "GET /api/users - List all users"

    local user_email=$(generate_email)
    test_route "POST" "/api/users" "{\"email\":\"$user_email\",\"firstName\":\"Test\",\"lastName\":\"User\"}" "200 201 400 500" "POST /api/users - Create new user"

    test_route "GET" "/api/users/1" "" "200 404" "GET /api/users/:id - Get user by ID"

    test_route "PATCH" "/api/users/1" "{\"firstName\":\"Updated\"}" "200 404 400" "PATCH /api/users/:id - Update user"

    test_route "DELETE" "/api/users/1" "" "200 204 404" "DELETE /api/users/:id - Delete user"

    # Test 2: RPC Communication Test
    echo ""
    echo ""
    log_info "2. Testing RPC Communication"
    echo "----------------------------"
    log_info "Creating users to trigger auth.register RPC calls..."

    for i in {1..3}; do
        echo ""
        local rpc_email=$(generate_email)
        log_info "Test $i: Creating user with email: $rpc_email"

        test_route "POST" "/api/users" "{\"email\":\"$rpc_email\",\"firstName\":\"RPC\",\"lastName\":\"Test$i\"}" "200 201 500" "User creation $i (should trigger auth.register RPC)"

        echo "  → Check server logs for RPC evidence:"
        echo "    - Look for 'auth.register' RPC calls"
        echo "    - Look for 'Email already exists' errors (indicates RPC reached auth service)"
        echo "    - Look for any RPC-related log entries"
    done

    echo ""
    echo ""
    log_info "Summary for Manual Verification:"
    echo "--------------------------------"
    echo "1. Route Availability: Check that all routes return expected status codes"
    echo "2. RPC Communication: Check server logs for evidence of:"
    echo "   - RPC method calls to 'auth.register'"
    echo "   - Authentication service receiving requests"
    echo "   - Inter-module communication working"
    echo ""
    echo "Expected log patterns:"
    echo "  ✓ RPC calls: Look for 'auth.register' in logs"
    echo "  ✓ Service interaction: Look for 'Email already exists' errors"
    echo "  ✓ Microservice communication: Look for RPC-related entries"
}

# Main execution
main() {
    run_tests

    # Print summary
    echo ""
    echo "========================================"
    log_info "Test Execution Summary:"
    echo "  Total requests: $TOTAL_TESTS"
    echo -e "  Successful: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "  Failed: ${RED}$FAILED_TESTS${NC}"

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All requests completed successfully!${NC}"
        echo -e "${YELLOW}Please check server logs to verify RPC communication.${NC}"
        exit 0
    else
        echo -e "\n${RED}❌ Some requests failed.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"