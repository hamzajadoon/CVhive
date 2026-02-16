@echo off
REM CVhive GitHub Setup Script
REM This script initializes your Git repository and prepares for GitHub push

echo ============================================================
echo CVhive — GitHub Repository Setup
echo ============================================================
echo.

REM Check if Git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git not found. Please restart PowerShell or Command Prompt.
    echo Then run this script again.
    pause
    exit /b 1
)

echo.
echo Step 1: Initializing Git repository...
git init

echo.
echo Step 2: Configuring Git user...
git config user.name "CVhive Developer"
git config user.email "your-email@example.com"

echo.
echo Step 3: Adding all files to staging...
git add .

echo.
echo Step 4: Creating initial commit...
git commit -m "Initial commit: CVhive recruitment platform with role-based CV access"

echo.
echo ============================================================
echo NEXT STEPS - Push to GitHub:
echo ============================================================
echo.
echo 1. Create repository on GitHub.com:
echo    - Go to https://github.com/new
echo    - Repository name: cvhive
echo    - Description: CV and Job Recruitment Platform for UAE
echo    - Choose: Public (for easy Render deployment)
echo    - Click "Create repository"
echo.
echo 2. Copy the HTTPS URL from GitHub (looks like):
echo    https://github.com/YOUR-USERNAME/cvhive.git
echo.
echo 3. Run these commands in PowerShell:
echo.
echo    git remote add origin https://github.com/YOUR-USERNAME/cvhive.git
echo    git branch -M main
echo    git push -u origin main
echo.
echo 4. When prompted, enter your GitHub credentials:
echo    - Username: your GitHub username
echo    - Password: your GitHub personal access token
echo      (Create at: https://github.com/settings/tokens)
echo.
echo ============================================================
pause
