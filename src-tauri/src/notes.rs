use serde_json::{json, Value};
use std::fs;
use std::path::Path;

pub fn read_notes(path: &Path) -> Result<Value, String> {
    ensure_file(path)?;
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if raw.trim().is_empty() {
        return Ok(empty_notes());
    }

    let mut notes: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    normalize_notes(&mut notes);
    Ok(notes)
}

pub fn add_entry(path: &Path, form_data: &str) -> Result<Value, String> {
    update_notes(path, |notes| {
        let (category, subcategory, content) = parse_entry(form_data);
        ensure_category(notes, &category);
        restore_subcategories(notes, &category);

        let target_category = subcategory.as_deref().unwrap_or(&category);
        ensure_category(notes, target_category);

        if !content.is_empty() {
            let next_id = next_log_id(notes, target_category);
            category_logs_mut(notes, target_category)?.push(json!({
                "id": next_id,
                "content": content,
                "status": "active",
            }));
        }

        Ok(())
    })
}

pub fn edit_logs(path: &Path, log_data_array: &Value) -> Result<Value, String> {
    update_notes(path, |notes| {
        for item in log_data_array.as_array().into_iter().flatten() {
            let Some(category) = item.get("category").and_then(Value::as_str) else {
                continue;
            };
            let Some(id) = item.get("id").and_then(string_or_number) else {
                continue;
            };
            let Some(content) = item.get("content").and_then(Value::as_str) else {
                continue;
            };
            if let Some(log) = find_log_mut(notes, category, id) {
                log["content"] = json!(content);
            }
        }
        Ok(())
    })
}

pub fn delete_logs(path: &Path, log_data_array: &Value) -> Result<Value, String> {
    update_notes(path, |notes| {
        for item in log_data_array.as_array().into_iter().flatten() {
            let Some(category) = item.get("logCategory").and_then(Value::as_str) else {
                continue;
            };
            let Some(id) = item.get("logId").and_then(string_or_number) else {
                continue;
            };
            if let Some(log) = find_log_mut(notes, category, id) {
                log["status"] = json!("deleted");
            }
        }
        Ok(())
    })
}

pub fn toggle_done(path: &Path, log_data_array: &Value) -> Result<Value, String> {
    update_notes(path, |notes| {
        for item in log_data_array.as_array().into_iter().flatten() {
            let Some(category) = item.get("logCategory").and_then(Value::as_str) else {
                continue;
            };
            let Some(id) = item.get("logId").and_then(string_or_number) else {
                continue;
            };
            if let Some(log) = find_log_mut(notes, category, id) {
                let next_status = if log.get("status").and_then(Value::as_str) == Some("active") {
                    "done"
                } else {
                    "active"
                };
                log["status"] = json!(next_status);
            }
        }
        Ok(())
    })
}

pub fn delete_category(path: &Path, category_name: &str) -> Result<Value, String> {
    update_notes(path, |notes| {
        for category in categories_mut(notes)? {
            let name = category
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if name == category_name || name.starts_with(&format!("{category_name}:")) {
                category["status"] = json!("deleted");
            }
        }
        Ok(())
    })
}

pub fn empty_category(path: &Path, category_name: &str) -> Result<Value, String> {
    update_notes(path, |notes| {
        if let Some(logs) = category_logs_mut(notes, category_name).ok() {
            for log in logs {
                log["status"] = json!("deleted");
            }
        }
        Ok(())
    })
}

pub fn move_category(path: &Path, category_name: &str, position: usize) -> Result<Value, String> {
    update_notes(path, |notes| {
        let categories = categories_mut(notes)?;
        let Some(category_index) = categories.iter().position(|category| {
            category.get("name").and_then(Value::as_str) == Some(category_name)
        }) else {
            return Ok(());
        };

        let category = categories.remove(category_index);
        let next_position = position.min(categories.len());
        categories.insert(next_position, category);
        Ok(())
    })
}

fn update_notes<F>(path: &Path, mutator: F) -> Result<Value, String>
where
    F: FnOnce(&mut Value) -> Result<(), String>,
{
    let mut notes = read_notes(path)?;
    mutator(&mut notes)?;
    write_notes(path, &notes)?;
    Ok(notes)
}

fn ensure_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    write_notes(path, &empty_notes())
}

fn write_notes(path: &Path, notes: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(notes).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn empty_notes() -> Value {
    json!({ "categories": [] })
}

fn normalize_notes(notes: &mut Value) {
    if !notes.get("categories").is_some_and(Value::is_array) {
        notes["categories"] = json!([]);
    }
}

fn parse_entry(form_data: &str) -> (String, Option<String>, String) {
    if !form_data.starts_with('/') {
        return ("notes".to_string(), None, form_data.to_string());
    }

    let mut parts = form_data.splitn(2, ' ');
    let full_path = parts.next().unwrap_or("").trim_start_matches('/');
    let content = parts.next().unwrap_or("").to_string();
    let path_parts: Vec<&str> = full_path.split(':').collect();
    let category = path_parts.first().unwrap_or(&"notes").to_lowercase();
    let subcategory = path_parts
        .get(1)
        .map(|part| format!("{category}:{}", part.to_lowercase()));

    (category, subcategory, content)
}

fn ensure_category(notes: &mut Value, category_name: &str) {
    if let Ok(categories) = categories_mut(notes) {
        if let Some(category) = categories
            .iter_mut()
            .find(|category| category.get("name").and_then(Value::as_str) == Some(category_name))
        {
            if category.get("status").and_then(Value::as_str) == Some("deleted") {
                category["status"] = json!("active");
            }
            return;
        }

        categories.push(json!({
            "name": category_name,
            "status": "active",
            "logs": [],
        }));
    }
}

fn restore_subcategories(notes: &mut Value, category_name: &str) {
    if let Ok(categories) = categories_mut(notes) {
        for category in categories {
            let name = category.get("name").and_then(Value::as_str).unwrap_or("");
            if name.starts_with(&format!("{category_name}:"))
                && category.get("status").and_then(Value::as_str) == Some("deleted")
            {
                category["status"] = json!("active");
            }
        }
    }
}

fn categories_mut(notes: &mut Value) -> Result<&mut Vec<Value>, String> {
    notes
        .get_mut("categories")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Notes categories are invalid".to_string())
}

fn category_logs_mut<'a>(
    notes: &'a mut Value,
    category_name: &str,
) -> Result<&'a mut Vec<Value>, String> {
    categories_mut(notes)?
        .iter_mut()
        .find(|category| category.get("name").and_then(Value::as_str) == Some(category_name))
        .and_then(|category| category.get_mut("logs"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("Category not found: {category_name}"))
}

fn next_log_id(notes: &mut Value, category_name: &str) -> u64 {
    category_logs_mut(notes, category_name)
        .ok()
        .map(|logs| {
            logs.iter()
                .filter_map(|log| log.get("id").and_then(Value::as_u64))
                .max()
                .unwrap_or(0)
                + 1
        })
        .unwrap_or(1)
}

fn find_log_mut<'a>(notes: &'a mut Value, category_name: &str, id: u64) -> Option<&'a mut Value> {
    category_logs_mut(notes, category_name)
        .ok()?
        .iter_mut()
        .find(|log| log.get("id").and_then(Value::as_u64) == Some(id))
}

fn string_or_number(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
}
