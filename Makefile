.PHONY: build dev test test:watch test:smoke typecheck lint render:workflow clean install

install:
	npm install

build: install
	npm run build

dev:
	npm run dev

test: install
	npm run test

test:watch:
	npm run test:watch

test:smoke: install
	npm run test:smoke

typecheck: install
	npm run typecheck

lint: typecheck

render:workflow:
	npm run render:workflow

clean:
	rm -rf dist

rebuild: clean build