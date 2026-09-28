#!/bin/bash
# Lambda handler. The Lambda Web Adapter layer (AWS_LAMBDA_EXEC_WRAPPER) runs
# this script, waits for the server on $PORT, and forwards every request to it.
HOSTNAME=0.0.0.0 exec node server.js
