const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const cheerio = require('cheerio');
const simpleGit = require('simple-git');
const git = simpleGit();

const SITE_DIR = path.join(__dirname, '../site');
const REPORTS_DIR = path.join(SITE_DIR, 'reports');
const RESEARCH_HTML = path.join(SITE_DIR, 'research.html');

async function main() {
    console.log('🔍 Scanning for new reports...');

    // 1. Scan for .html files in the root of reports/
    const files = await fs.readdir(REPORTS_DIR);
    const reportFiles = [];

    for (const file of files) {
        const filePath = path.join(REPORTS_DIR, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile() && file.endsWith('.html') && file !== 'README.md') {
            reportFiles.push(file);
        }
    }

    if (reportFiles.length === 0) {
        console.log('❌ No new reports found in site/reports/');
        return;
    }

    // 2. Prompt user
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'filename',
            message: 'Select a report to publish:',
            choices: reportFiles
        },
        {
            type: 'input',
            name: 'title',
            message: 'Report Title:',
            validate: input => input.length > 0 ? true : 'Title is required'
        },
        {
            type: 'list',
            name: 'category',
            message: 'Category:',
            choices: ['macro', 'equity', 'crypto', 'strategy']
        },
        {
            type: 'input',
            name: 'date',
            message: 'Date (YYYY-MM-DD):',
            default: new Date().toISOString().split('T')[0]
        },
        {
            type: 'input',
            name: 'excerpt',
            message: 'Excerpt (short description):',
            validate: input => input.length > 0 ? true : 'Excerpt is required'
        },
        {
            type: 'input',
            name: 'readTime',
            message: 'Read Time (e.g., "5 min read"):',
            default: '5 min read'
        }
    ]);

    // 3. Move file
    const dateObj = new Date(answers.date);
    const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    const targetDir = path.join(REPORTS_DIR, answers.category, yearMonth);

    await fs.ensureDir(targetDir);
    const targetPath = path.join(targetDir, answers.filename);
    const sourcePath = path.join(REPORTS_DIR, answers.filename);

    console.log(`📦 Moving file to ${targetDir}...`);
    await fs.move(sourcePath, targetPath, { overwrite: true });

    // 4. Update research.html
    console.log('📝 Updating research.html...');
    const htmlContent = await fs.readFile(RESEARCH_HTML, 'utf8');
    const $ = cheerio.load(htmlContent);

    // Construct relative link
    const relativeLink = `reports/${answers.category}/${yearMonth}/${answers.filename}`;

    // Category styling
    let accentColor = 'var(--accent)'; // default/macro
    let categoryClass = 'macro';

    if (answers.category === 'equity') {
        accentColor = 'var(--accent-purple)';
        categoryClass = 'equity';
    } else if (answers.category === 'crypto') {
        accentColor = 'var(--accent-blue)';
        categoryClass = 'crypto';
    } else if (answers.category === 'strategy') {
        accentColor = 'var(--accent-amber)';
        categoryClass = 'strategy';
    }

    // Format date for display (e.g., Nov 29, 2025)
    const dateDisplay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const newCard = `
        <a href="${relativeLink}" class="research-card" data-category="${answers.category}">
            <div class="card-image">
                <svg class="card-image-pattern" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <rect width="100%" height="100%" fill="url(#grid1)" />
                </svg>
                <span class="card-image-icon">📄</span>
            </div>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-category">${answers.category.charAt(0).toUpperCase() + answers.category.slice(1)}</span>
                    <span class="card-date">${dateDisplay}</span>
                </div>
                <h3 class="card-title">${answers.title}</h3>
                <p class="card-excerpt">${answers.excerpt}</p>
                <div class="card-footer">
                    <span class="card-read-time">${answers.readTime}</span>
                    <span class="card-arrow">→</span>
                </div>
            </div>
        </a>`;

    // Prepend to grid
    $('#researchGrid').prepend(newCard);

    await fs.writeFile(RESEARCH_HTML, $.html(), 'utf8');

    // 5. Git operations
    console.log('🚀 Pushing to GitHub...');

    try {
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            await git.init();
            console.log('Initialized git repository');
        }

        await git.add('.');
        await git.commit(`Add report: ${answers.title}`);

        // Check if remote exists, if not, warn user
        const remotes = await git.getRemotes();
        if (remotes.length === 0) {
            console.log('⚠️  No remote repository configured. Changes committed locally.');
            console.log('   Run "git remote add origin <url>" and "git push -u origin main" to push.');
        } else {
            await git.push();
            console.log('✅ Changes pushed to GitHub!');
        }
    } catch (err) {
        console.error('❌ Git error:', err.message);
    }

    console.log('✨ Done!');
}

main().catch(console.error);
