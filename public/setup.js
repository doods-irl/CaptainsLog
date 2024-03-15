document.addEventListener('DOMContentLoaded', () => {
    const textbox = document.getElementById('textbox');
    const submitButton = document.getElementById('submit-button');

    // Setup the listener for the selected directory
    window.electronAPI.receiveSelectedDirectory((path) => {
        textbox.value = path;
        submitButton.disabled = false;
    });

    document.getElementById('browse-button').addEventListener('click', () => {
        window.electronAPI.openFileDialog();
    });

    document.getElementById('text-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const selectedPath = document.getElementById('textbox').value;
        window.electronAPI.sendPath(selectedPath);
    });
});