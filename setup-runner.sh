#!/bin/bash

# NIBS Network - GitHub Runner & Environment Setup Script
# Run this on your EC2 instance: bash setup-runner.sh

echo "=== Starting Environment Setup ==="

# 1. Update and install basic tools
sudo apt-get update
sudo apt-get install -y curl git unzip build-essential

# 2. Install Node.js 20
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 4. (Skipped) Playwright dependencies not needed
# echo "Installing Playwright system dependencies..."
# sudo npx playwright install-deps chromium

# 5. Create runner directory
mkdir -p ~/actions-runner && cd ~/actions-runner

# 6. Download the latest runner package
echo "Downloading GitHub Actions Runner..."
curl -o actions-runner-linux-x64-2.321.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz

# 7. Extract the installer
tar xzf ./actions-runner-linux-x64-2.321.0.tar.gz

echo ""
echo "=== Setup Complete ==="
echo "Next Steps:"
echo "1. Go to GitHub -> Settings -> Actions -> Runners -> New self-hosted runner"
echo "2. Run this command to configure (replace <TOKEN> with yours):"
echo "   ./config.sh --url https://github.com/afrintabassum86-svg/nibsnetwork-3.0--automation --token <TOKEN>"
echo "3. Run the runner in the background:"
echo "   ./run.sh &"
echo ""
echo "Note: To keep the runner persistent, consider using 'sudo ./svc.sh install' and 'sudo ./svc.sh start' after configuration."
