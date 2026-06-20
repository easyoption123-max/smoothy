import os
import zipfile

def create_zip(source_dir, output_zip):
    ignore_dirs = {'.git', '.github', 'node_modules', 'dist', '__pycache__'}
    ignore_files = {'smoothy-source-code.zip', 'create_zip.py'}
    
    # Ensure public folder exists
    public_dir = os.path.join(source_dir, 'public')
    if not os.path.exists(public_dir):
        os.makedirs(public_dir)
        
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            # Modify dirs in-place to avoid walking ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                if file in ignore_files:
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zipf.write(file_path, arcname)

if __name__ == '__main__':
    source = '/home/team/shared/smoothy-app'
    output = '/home/team/shared/smoothy-app/public/smoothy-source-code.zip'
    create_zip(source, output)
    print("ZIP package successfully created at public/smoothy-source-code.zip!")
