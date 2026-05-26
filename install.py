import os
import re
import subprocess
import sys

def run_command(command, cwd=None):
    use_shell = os.name == 'nt'
    result = subprocess.run(command, cwd=cwd, shell=use_shell)
    if result.returncode != 0:
        print(f"❌ Ошибка при выполнении команды: {command}")
        sys.exit(result.returncode)

def check_node():
    print("🔍 Проверяем установку и версию Node.js...")
    try:
        result = subprocess.run(["node", "-v"], capture_output=True, text=True, shell=os.name == 'nt')
        if result.returncode != 0:
            print(f"⚠️ Внимание! Node.js не обнаружен")
            raise FileNotFoundError
            
        version_str = result.stdout.strip()
        match = re.search(r'v?(\d+)\.(\d+)', version_str)
        
        if match:
            major = int(match.group(1))
            minor = int(match.group(2))
            
            if major < 20 or (major == 20 and minor < 19):
                print(f"⚠️ Внимание! Обнаружена устаревшая версия Node.js: {version_str}")
                raise ValueError("Outdated version")
                
            print(f"✅ Node.js {version_str} подходит")
            return True
            
    except (FileNotFoundError, ValueError, subprocess.SubprocessError):
        pass
    
    print("\n⚠️ Установите/обновите Node.js до версии 20.19+:")
    print("https://nodejs.org/")
    print("\nПосле установки/обновления Node.js перезапустите этот скрипт через 'python install.py'")
    sys.exit(1)

def main():
    print("Установка зависимостей...")

    check_node()

    if not os.path.exists("venv"):
        print("\n📦 Создаем виртуальное окружение venv...")
        run_command([sys.executable, "-m", "venv", "venv"])
    else:
        print("\n✅ Виртуальное окружение venv уже существует.")

    if os.name == 'nt':
        pip_path = os.path.join("venv", "Scripts", "pip")
    else:
        pip_path = os.path.join("venv", "bin", "pip")

    req_path = os.path.join("backend", "requirements.txt")
    if not os.path.exists(req_path):
        req_path = "requirements.txt"

    print(f"📦 Устанавливаем Python библиотеки из {req_path}...")
    run_command([pip_path, "install", "-r", req_path])

    if os.path.exists("frontend"):
        print("\n📦 Устанавливаем Node.js зависимости для фронтенда (npm install)...")
        run_command(["npm", "install"], cwd="frontend")
        run_command(["npm", "audit", "fix"], cwd="frontend")
    else:
        print("\n⚠️ Папка frontend не найдена")

    print("\n" + "="*60)
    print("✅ Все зависимости успешно установлены")
    print("Теперь вы можете запустить проект через 'python run.py'")
    print("="*60)

if __name__ == "__main__":
    main()