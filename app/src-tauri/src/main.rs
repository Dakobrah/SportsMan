// The Windows release build is a GUI app, not a console one.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sportsman_lib::run()
}
