{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-23.11";

    treefmt-nix = {
      url = "github:numtide/treefmt-nix/e504621290a1fd896631ddbc5e9c16f4366c9f65";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };

    nixpkgs-cross-overlay = {
      url = "github:alekseysidorov/nixpkgs-cross-overlay";
      inputs = {
        nixpkgs.follows = "nixpkgs";
        rust-overlay.follows = "rust-overlay";
        treefmt-nix.follows = "treefmt-nix";
      };
    };

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };

    flake-root.url = "github:srid/flake-root";
  };

  outputs = inputs@{ flake-parts, nixpkgs, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.flake-root.flakeModule
      ];

      systems = nixpkgs.lib.systems.flakeExposed;

      perSystem = { config, self', inputs', system, nixpkgs, pkgs, ... }:
        let
          localSystem = system;


          frontend = pkgs.buildNpmPackage {
            name = "pica-frontend";

            buildInputs = with pkgs; [
              nodejs_20
            ];

            src = ./frontend;
            npmDepsHash = "sha256-UA4al67fQb415gsJMVQAk6vCoOfAZgHi95xdkSQhZ+I=";

            installPhase = ''
              mkdir $out
              cp -r dist $out
            '';
          };

          buildForCrossSytem = { crossSystem, nixpkgs, rust-overlay, nixpkgs-cross-overlay }:
            let
              # Manual packages initialization, because the flake parts does not
              # yet come with an endoursed module.
              pkgs = import nixpkgs {
                inherit system;
                overlays = [
                  nixpkgs-cross-overlay.overlays.default
                ];
              };

              pkgsCross = pkgs.mkCrossPkgs {
                src = nixpkgs;
                inherit localSystem crossSystem;

                overlays = [
                  rust-overlay.overlays.default
                  nixpkgs-cross-overlay.overlays.default
                ];
              };

              rustToolchain = pkgsCross.pkgsBuildHost.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

              rustPlatform = pkgsCross.makeRustPlatform {
                cargo = rustToolchain;
                rustc = rustToolchain;
              };

              serviceName = "pica";

              servicePackage = rustPlatform.buildRustPackage {
                pname = serviceName;
                version = "0.1.0";
                src = ./.;
                cargoLock.lockFile = ./Cargo.lock;

                nativeBuildInputs = with pkgsCross; [
                  # Will add some dependencies like libiconv
                  # pkgsBuildHost.libiconv
                  pkgsBuildHost.nasm
                  # Cargo crate dependenciesr
                  # cargoDeps.rocksdb-sys
                  # cargoDeps.rdkafka-sys
                  # cargoDeps.openssl-sys
                ];

                # Libraries essential to build the service binaries
                buildInputs = with pkgsCross; [
                  # Enable Rust cross-compilation support
                  rustCrossHook
                  pkgsCross.sqlite
                ];

                preBuild = ''
                  cp -ra ${frontend.out}/dist frontend
                '';
              };
            in
            pkgsCross.pkgsBuildHost.dockerTools.buildLayeredImage {
              name = serviceName;
              tag = crossSystem.config;

              contents = with pkgsCross; [
                servicePackage
                dockerTools.caCertificates
                imagemagick
                ./docker
                # Utilites like ldd and bash to help image debugging
                # stdenv.cc.libc_bin
                # coreutils
                # bashInteractive
              ];

              config = {
                Entrypoint = [ serviceName ];
                WorkingDir = "/app";
                Expose = 3000;
              };
            };
        in
        rec {
          packages.dockerImage-aarch64 = buildForCrossSytem {
            inherit (inputs) nixpkgs rust-overlay nixpkgs-cross-overlay;
            crossSystem = {
              config = "aarch64-unknown-linux-gnu";
              useLLVM = true;
            };
          };

          packages.dockerImage-x86_64 = buildForCrossSytem {
            inherit (inputs) nixpkgs rust-overlay nixpkgs-cross-overlay;
            crossSystem = {
              config = "x86_64-unknown-linux-gnu";
              useLLVM = true;
            };
          };

          packages.dockerImage-armv7 = buildForCrossSytem {
            inherit (inputs) nixpkgs rust-overlay nixpkgs-cross-overlay;
            crossSystem = {
              config = "armv7l-unknown-linux-gnueabihf";
              useLLVM = true;
            };
          };

          packages.dockerImage = pkgs.writeShellScriptBin "push"
            ''
              set -euxo pipefail
              docker=${pkgs.docker}/bin/docker

              docker load -qi ${packages.dockerImage-aarch64}
              docker load -qi ${packages.dockerImage-x86_64}
              docker load -qi ${packages.dockerImage-armv7}

              for arch in aarch64-unknown-linux-musl x86_64-unknown-linux-musl armv7l-unknown-linux-gnueabihf ; do
                docker tag pica:$arch ghcr.io/pica-gallery/pica:$arch
                docker push ghcr.io/pica-gallery/pica:$arch
              done

              $docker manifest create --amend ghcr.io/pica-gallery/pica:latest  \
                ghcr.io/pica-gallery/pica:aarch64-unknown-linux-musl \
                ghcr.io/pica-gallery/pica:x86_64-unknown-linux-musl \
                ghcr.io/pica-gallery/pica:armv7l-unknown-linux-gnueabihf

              $docker manifest push ghcr.io/pica-gallery/pica:latest
            '';

          packages.default = packages.dockerImage;
        };

    };
}
