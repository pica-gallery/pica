{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-24.05";

    crane = {
      url = "github:ipetkov/crane";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { crane, rust-overlay, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ (import rust-overlay) ];
        };

        frontend = pkgs.buildNpmPackage {
          name = "pica-frontend";

          buildInputs = with pkgs; [
            nodejs_20
          ];

          src = ./frontend;
          npmDepsHash = "sha256-fqpddHrpxqwJ6H60645Z655LITZzbR0Xm0rEa0hf9l4=";

          installPhase = ''
            mkdir $out
            cp -r dist $out
            gzip -v9k $out/dist/pica/browser/*.*
          '';
        };

        # get the rust toolchain to build our application
        rustToolchain = (pkgs.pkgsBuildHost.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml).override {
          targets = [
            "aarch64-unknown-linux-gnu"
            "x86_64-unknown-linux-gnu"
          ];
        };

        craneLib = ((crane.mkLib pkgs).overrideToolchain rustToolchain);

        # Collect sources to compile
        src = pkgs.lib.cleanSourceWith {
          src = ./.;
          filter = path: type:
            (pkgs.lib.hasSuffix "worldcities.csv.gz" path) ||
            (pkgs.lib.hasInfix "/frontend/dist/pica/browser/" path) ||
            (craneLib.filterCargoSources path type);
        };

        # Arguments to be used by all cargo builds
        commonArgs = {
          inherit src;
          strictDeps = true;
          doCheck = false;
          cargoCheckCommand = "true";
        };

        backend = target: pkgs:
          craneLib.buildPackage (commonArgs // {
            pname = "pica";

            # only run tests on native architecture
            doCheck = pkgs.pkgsBuildHost.system == pkgs.system;

            TARGET_CC = "${pkgs.stdenv.cc}/bin/${pkgs.stdenv.cc.targetPrefix}cc";
            CARGO_BUILD_TARGET = target;

            CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER =
              with pkgs.pkgsCross.gnu64; "${stdenv.cc}/bin/${stdenv.cc.targetPrefix}cc";

            CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER =
              with pkgs.pkgsCross.aarch64-multiplatform; "${stdenv.cc}/bin/${stdenv.cc.targetPrefix}cc";

            # make openssl
            # OPENSSL_DIR = "${pkgs.openssl.dev}";
            # OPENSSL_LIB_DIR = "${pkgs.openssl.out}/lib";
            # OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include/";

            preBuild = ''
              cp -ra ${frontend}/dist frontend/
            '';

            # buildInputs = [
            #   pkgs.openssl
            # ];

            depsBuildBuild = [
              pkgs.stdenv.cc
              pkgs.nasm
            ];
          });

        backend-amd64 = backend "x86_64-unknown-linux-gnu" pkgs.pkgsCross.gnu64;
        backend-aarch64 = backend "aarch64-unknown-linux-gnu" pkgs.pkgsCross.aarch64-multiplatform;

        dockerImage-arch = backend: arch: pkgs: system: pkgs.dockerTools.streamLayeredImage {
          name = "pica";
          tag = "latest-${arch}";
          enableFakechroot = true;
          contents =
            let
              pkgsTarget = import nixpkgs { inherit system; };
            in
            [
              pkgs.dockerTools.caCertificates
              pkgsTarget.imagemagick
              backend
              ./docker
            ];
          architecture = arch;
          config = {
            WorkingDir = "/app/";
            Entrypoint = [ "${backend}/bin/pica" ];
            ExposedPorts = {"3000/tcp" = {};};
          };
        };

        dockerImage-aarch64 = dockerImage-arch backend-aarch64 "aarch64" pkgs.pkgsCross.aarch64-multiplatform "aarch64-linux";
        dockerImage-amd64 = dockerImage-arch backend-amd64 "amd64" pkgs.pkgsCross.gnu64 "x86_64-linux";

        dockerImage = pkgs.writeShellScriptBin "dockerImage" ''
          set -ex

          TAG=${"$"}{1:-latest}
          DOCKER=${pkgs.docker}/bin/docker

          ${dockerImage-amd64} | ${pkgs.skopeo}/bin/skopeo --insecure-policy \
            copy docker-archive:/dev/stdin \
            docker://ghcr.io/pica-gallery/pica:$TAG-amd64

          ${dockerImage-aarch64} | ${pkgs.skopeo}/bin/skopeo --insecure-policy \
            copy docker-archive:/dev/stdin \
            docker://ghcr.io/pica-gallery/pica:$TAG-aarch64

          # we need to delete the previous manifest before we can create a new one
          # otherwise it does not get updated, even with the --amend parameter.
          $DOCKER manifest rm ghcr.io/pica-gallery/pica:$TAG || true

          $DOCKER manifest create ghcr.io/pica-gallery/pica:$TAG \
            ghcr.io/pica-gallery/pica:$TAG-amd64 \
            ghcr.io/pica-gallery/pica:$TAG-aarch64

          $DOCKER manifest push ghcr.io/pica-gallery/pica:$TAG
        '';


        #  buildForCrossSytem = { crossSystem, nixpkgs, rust-overlay }:
        #    let
        #      pkgsCross = import nixpkgs {
        #        src = nixpkgs;
        #        inherit localSystem crossSystem;

        #        overlays = [
        #          rust-overlay.overlays.default
        #        ];
        #      };

        #      rustToolchain = pkgsCross.pkgsBuildHost.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;

        #      rustPlatform = pkgsCross.makeRustPlatform {
        #        cargo = rustToolchain;
        #        rustc = rustToolchain;
        #      };

        #      serviceName = "pica";

        #      servicePackage = rustPlatform.buildRustPackage {
        #        pname = serviceName;
        #        version = "0.1.0";
        #        src = ./.;
        #        cargoLock.lockFile = ./Cargo.lock;

        #        nativeBuildInputs = with pkgsCross; [
        #          # Will add some dependencies like libiconv
        #          # pkgsBuildHost.libiconv
        #          pkgsBuildHost.nasm
        #          # Cargo crate dependenciesr
        #          # cargoDeps.rocksdb-sys
        #          # cargoDeps.rdkafka-sys
        #          # cargoDeps.openssl-sys
        #        ];

        #        # Libraries essential to build the service binaries
        #        buildInputs = [
        #          # Enable Rust cross-compilation support
        #          # rustCrossHook
        #          pkgsCross.sqlite
        #        ];

        #        preBuild = ''
        #          cp -ra ${frontend.out}/dist frontend
        #        '';
        #      };
        #    in
        #    pkgsCross.pkgsBuildHost.dockerTools.buildLayeredImage {
        #      name = serviceName;
        #      tag = crossSystem.config;

        #      contents = with pkgsCross; [
        #        servicePackage
        #        dockerTools.caCertificates
        #        imagemagick
        #        ./docker
        #        # Utilites like ldd and bash to help image debugging
        #        # stdenv.cc.libc_bin
        #        # coreutils
        #        # bashInteractive
        #      ];

        #      config = {
        #        Entrypoint = [ serviceName ];
        #        WorkingDir = "/app";
        #        Expose = 3000;
        #      };
        #    };
      in
      {
        #  packages.dockerImage-aarch64 = buildForCrossSytem {
        #    inherit (inputs) nixpkgs rust-overlay;
        #    crossSystem = {
        #      config = "aarch64-unknown-linux-gnu";
        #      useLLVM = true;
        #    };
        #  };

        #  packages.dockerImage-x86_64 = buildForCrossSytem {
        #    inherit (inputs) nixpkgs rust-overlay;
        #    crossSystem = {
        #      config = "x86_64-unknown-linux-gnu";
        #      useLLVM = true;
        #    };
        #  };

        #  packages.dockerImage-armv7 = buildForCrossSytem {
        #    inherit (inputs) nixpkgs rust-overlay;
        #    crossSystem = {
        #      config = "armv7l-unknown-linux-gnueabihf";
        #      useLLVM = true;
        #    };
        #  };

        #  packages.dockerImage = pkgs.writeShellScriptBin "push"
        #    ''
        #      set -euxo pipefail
        #      docker=${pkgs.docker}/bin/docker

        #      docker load -qi ${packages.dockerImage-aarch64}
        #      docker load -qi ${packages.dockerImage-x86_64}
        #      docker load -qi ${packages.dockerImage-armv7}

        #      for arch in aarch64-unknown-linux-musl x86_64-unknown-linux-musl armv7l-unknown-linux-gnueabihf ; do
        #        docker tag pica:$arch ghcr.io/pica-gallery/pica:$arch
        #        docker push ghcr.io/pica-gallery/pica:$arch
        #      done

        #      $docker manifest create --amend ghcr.io/pica-gallery/pica:latest  \
        #        ghcr.io/pica-gallery/pica:aarch64-unknown-linux-musl \
        #        ghcr.io/pica-gallery/pica:x86_64-unknown-linux-musl \
        #        ghcr.io/pica-gallery/pica:armv7l-unknown-linux-gnueabihf

        #      $docker manifest push ghcr.io/pica-gallery/pica:latest
        #    '';

        packages = {
          inherit frontend backend-amd64 backend-aarch64;
          inherit dockerImage dockerImage-aarch64 dockerImage-amd64;
        };
        #
      });
}
