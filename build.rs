fn main() {
    println!("cargo:rerun-if-changed=sql");
    println!("cargo:rerun-if-changed=frontend/dist/");
}
