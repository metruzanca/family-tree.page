{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    nodejs_24
    pnpm
    postgresql_18
    openssl
    curl
  ];

  shellHook = ''
    echo "Roots dev shell: Node $(node --version), pnpm $(pnpm --version), Postgres $(postgres --version | cut -d' ' -f3)"
    echo "Run: pnpm dev:services"
  '';
}
