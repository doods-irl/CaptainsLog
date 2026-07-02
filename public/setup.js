document.addEventListener('DOMContentLoaded', () => {
    if (!window.hostAPI) {
        document.body.textContent = "Captain's Log could not start: host API is unavailable.";
        return;
    }

    const textbox = document.getElementById('textbox');
    const submitButton = document.getElementById('submit-button');

    // Setup the listener for the selected directory
    window.hostAPI.receiveSelectedDirectory((path) => {
        textbox.value = path;
        submitButton.disabled = false;
    });

    document.getElementById('browse-button').addEventListener('click', () => {
        window.hostAPI.openFileDialog();
    });

    document.getElementById('text-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const selectedPath = document.getElementById('textbox').value;
        window.hostAPI.sendPath(selectedPath);
    });
});
