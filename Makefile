##
# Dependencies
##
code/common/state/external/automerge.js:
	wget https://unpkg.com/automerge@0.14.1/dist/automerge.js -O $@
code/common/state/external/peerjs.min.js:
	wget https://unpkg.com/peerjs@1.1.0/dist/peerjs.min.js -O $@
code/common/state/external/cuid.min.js:
	wget https://unpkg.com/cuid@2.1.6/dist/cuid.min.js -O $@
code/common/state/external/verb.min.js:
	wget https://unpkg.com/verb-nurbs@2.0.2/build/js/verb.min.js -O $@
code/common/state/external/perge.min.js:
	wget https://unpkg.com/perge@1.2.1/dist/index.umd.js -O $@

build/index.html: build/dependencies.js build/state.js build/onlylines.js build/onlylines.css code/webapp/index.html
	mkdir -p $(dir $@)
	cp code/webapp/index.html $@

build/state.js: build/dependencies.js
	mkdir -p $(dir $@)
	cp code/common/state/state.js $@

build/onlylines.css:
	mkdir -p $(dir $@)
	cp code/webapp/onlylines.css $@
	
build/onlylines.js:
	mkdir -p $(dir $@)
	cp code/webapp/onlylines.js $@

build/dependencies.js: code/common/state/external/automerge.js code/common/state/external/peerjs.min.js code/common/state/external/cuid.min.js code/common/state/external/verb.min.js code/common/state/external/perge.min.js
	mkdir -p $(dir $@)
	touch $@
	cat code/common/state/external/automerge.js >> $@
	cat code/common/state/external/peerjs.min.js >> $@
	cat code/common/state/external/perge.min.js >> $@
	cat code/common/state/external/cuid.min.js >> $@
	cat code/common/state/external/verb.min.js >> $@
	cat code/common/state/dependencies.js >> $@
	sed -n '/\/\/#/!p' $@ > tmp
	mv tmp $@


clean:
	rm -rf build

serve:
#	/usr/bin/python3 -m http.server --directory build & find code/* | entr -s 'make clean build/index.html ; open -g http://localhost:8000'
	parcel serve code/webapp/index.html

stop:
	killall Python
