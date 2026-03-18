# Настройка GitHub: репозиторий `chatera-frontend`

Репозиторий на сервере GitHub **нужно создать вручную** (или через CLI) — из редактора кода без твоего логина это сделать нельзя.

## Что нужно заранее

1. Аккаунт на [github.com](https://github.com)
2. Установленный **Git** (у тебя уже есть: проект под git)
3. Желательно **не коммитить** секреты: `.env` уже в `.gitignore`

---

## Вариант A: через сайт GitHub (проще всего)

1. Зайди на https://github.com/new  
2. **Repository name:** `chatera-frontend`  
3. Выбери **Public** или **Private**  
4. **Не** ставь галочки «Add README» / «.gitignore» / «license» (у тебя уже есть код локально)  
5. Нажми **Create repository**

6. В папке проекта в терминале (подставь свой ник вместо `YOUR_USERNAME`):

```bash
cd /path/to/Chatera

git add .
git commit -m "Initial commit: Chatera frontend"

git remote add origin https://github.com/YOUR_USERNAME/chatera-frontend.git
git branch -M main
git push -u origin main
```

Если GitHub попросит пароль — используй **Personal Access Token** (Settings → Developer settings → Tokens), не пароль от аккаунта.

---

## Вариант B: GitHub CLI (`gh`)

```bash
brew install gh
gh auth login
cd /path/to/Chatera
git add .
git commit -m "Initial commit: Chatera frontend"
gh repo create chatera-frontend --public --source=. --remote=origin --push
```

`--private` вместо `--public`, если нужен закрытый репозиторий.

---

## Если `remote origin` уже был

```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/chatera-frontend.git
git push -u origin main
```

---

## Зачем это

Один репозиторий на GitHub = история коммитов, откат версий, ветки, не нужно «переписывать код с нуля» при смене подхода — всегда можно вернуться к нужному коммиту.
