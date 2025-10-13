{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-25.05";

    crane = {
      url = "github:ipetkov/crane";
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
            nodejs_22
          ];

          src = ./frontend;
          npmDepsHash = "sha256-lXmoqTUW8F6cz2JcdoyYdbIvBw/F0BMxhZzwb82DblI=";

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
            (pkgs.lib.hasSuffix ".sql" path) ||
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
            ExposedPorts = { "3000/tcp" = { }; };
          };
        };

        dockerImage-aarch64 = dockerImage-arch backend-aarch64 "arm64" pkgs.pkgsCross.aarch64-multiplatform "aarch64-linux";
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
            docker://ghcr.io/pica-gallery/pica:$TAG-arm64

          # we need to delete the previous manifest before we can create a new one
          # otherwise it does not get updated, even with the --amend parameter.
          $DOCKER manifest rm ghcr.io/pica-gallery/pica:$TAG || true

          $DOCKER manifest create ghcr.io/pica-gallery/pica:$TAG \
            ghcr.io/pica-gallery/pica:$TAG-amd64 \
            ghcr.io/pica-gallery/pica:$TAG-arm64

          $DOCKER manifest push ghcr.io/pica-gallery/pica:$TAG
        '';
      in
      {
        packages = {
          inherit frontend backend-amd64 backend-aarch64;
          inherit dockerImage dockerImage-aarch64 dockerImage-amd64;
        };
        #
      });
}
