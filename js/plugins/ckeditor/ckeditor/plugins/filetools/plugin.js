

'use strict';

( function() {
	CKEDITOR.plugins.add( 'filetools', {
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%

		beforeInit: function( editor ) {
			
			editor.uploadRepository = new UploadRepository( editor );

			
			editor.on( 'fileUploadRequest', function( evt ) {
				var fileLoader = evt.data.fileLoader;

				fileLoader.xhr.open( 'POST', fileLoader.uploadUrl, true );
			}, null, null, 5 );

			editor.on( 'fileUploadRequest', function( evt ) {
				var fileLoader = evt.data.fileLoader,
					formData = new FormData();
				
				if ( saveto == 'qiniu' ) {
					formData.append( 'file', fileLoader.file, fileLoader.fileName );
					formData.append( 'key', Math.round(new Date().getTime()/1000) +'_'+ fileLoader.fileName );
					formData.append( 'token', qiniu_uptoken );
				} else {
					
					formData.append( 'upload', fileLoader.file, fileLoader.fileName );
					// Append token preventing CSRF attacks.
					formData.append( 'ckCsrfToken', CKEDITOR.tools.getCsrfToken() );
				}

				fileLoader.xhr.send( formData );
			}, null, null, 999 );

			
			editor.on( 'fileUploadResponse', function( evt ) {
				var fileLoader = evt.data.fileLoader,
					xhr = fileLoader.xhr,
					data = evt.data;

				try {
					var response = JSON.parse( xhr.responseText );

					// Error message does not need to mean that upload finished unsuccessfully.
					// It could mean that ex. file name was changes during upload due to naming collision.
					if ( response.error && response.error.message ) {
						data.message = response.error.message;
					}

					if ( saveto == 'qiniu' ) {
						data.fileName = response.key;
						data.url = qiniu_bucket_domain+ '/' + response.key;
					} else {
						data.fileName = response.fileName;
						data.url = response.url;
					}
				} catch ( err ) {
					// Response parsing error.
					data.message = fileLoader.lang.filetools.responseError;
					CKEDITOR.warn( 'filetools-response-error', { responseText: xhr.responseText } );

					evt.cancel();
				}
			}, null, null, 999 );
		}
	} );

	
	function UploadRepository( editor ) {
		this.editor = editor;

		this.loaders = [];
	}

	UploadRepository.prototype = {
		
		create: function( fileOrData, fileName ) {
			var id = this.loaders.length,
				loader = new FileLoader( this.editor, fileOrData, fileName );

			loader.id = id;
			this.loaders[ id ] = loader;

			this.fire( 'instanceCreated', loader );

			return loader;
		},

		
		isFinished: function() {
			for ( var id = 0; id < this.loaders.length; ++id ) {
				if ( !this.loaders[ id ].isFinished() ) {
					return false;
				}
			}

			return true;
		}

		

		
	};

	
	function FileLoader( editor, fileOrData, fileName ) {
		var mimeParts,
			defaultFileName = editor.config.fileTools_defaultFileName;

		this.editor = editor;
		this.lang = editor.lang;

		if ( typeof fileOrData === 'string' ) {
			// Data are already loaded from disc.
			this.data = fileOrData;
			this.file = dataToFile( this.data );
			this.total = this.file.size;
			this.loaded = this.total;
		} else {
			this.data = null;
			this.file = fileOrData;
			this.total = this.file.size;
			this.loaded = 0;
		}

		if ( fileName ) {
			this.fileName = fileName;
		} else if ( this.file.name ) {
			this.fileName = this.file.name;
		} else {
			mimeParts = this.file.type.split( '/' );

			if ( defaultFileName ) {
				mimeParts[ 0 ] = defaultFileName;
			}

			this.fileName = mimeParts.join( '.' );
		}

		this.uploaded = 0;
		this.uploadTotal = null;

		this.status = 'created';

		this.abort = function() {
			this.changeStatus( 'abort' );
		};
	}

	

	

	

	

	

	

	

	

	

	

	

	

	

	

	

	FileLoader.prototype = {
		
		loadAndUpload: function( url ) {
			var loader = this;

			this.once( 'loaded', function( evt ) {
				// Cancel both 'loaded' and 'update' events,
				// because 'loaded' is terminated state.
				evt.cancel();

				loader.once( 'update', function( evt ) {
					evt.cancel();
				}, null, null, 0 );

				// Start uploading.
				loader.upload( url );
			}, null, null, 0 );

			this.load();
		},

		
		load: function() {
			var loader = this;

			this.reader = new FileReader();

			var reader = this.reader;

			loader.changeStatus( 'loading' );

			this.abort = function() {
				loader.reader.abort();
			};

			reader.onabort = function() {
				loader.changeStatus( 'abort' );
			};

			reader.onerror = function() {
				loader.message = loader.lang.filetools.loadError;
				loader.changeStatus( 'error' );
			};

			reader.onprogress = function( evt ) {
				loader.loaded = evt.loaded;
				loader.update();
			};

			reader.onload = function() {
				loader.loaded = loader.total;
				loader.data = reader.result;
				loader.changeStatus( 'loaded' );
			};

			reader.readAsDataURL( this.file );
		},

		
		upload: function( url ) {
			if ( !url ) {
				this.message = this.lang.filetools.noUrlError;
				this.changeStatus( 'error' );
			} else {
				this.uploadUrl = url;

				this.xhr = new XMLHttpRequest();
				this.attachRequestListeners();

				if ( this.editor.fire( 'fileUploadRequest', { fileLoader: this } ) ) {
					this.changeStatus( 'uploading' );
				}
			}
		},

		
		attachRequestListeners: function() {
			var loader = this,
				xhr = this.xhr;

			loader.abort = function() {
				xhr.abort();
			};

			xhr.onerror = onError;
			xhr.onabort = onAbort;

			// #13533 - When xhr.upload is present attach onprogress, onerror and onabort functions to get actual upload
			// information.
			if ( xhr.upload ) {
				xhr.upload.onprogress = function( evt ) {
					if ( evt.lengthComputable ) {
						// Set uploadTotal with correct data.
						if ( !loader.uploadTotal ) {
							loader.uploadTotal = evt.total;
						}
						loader.uploaded = evt.loaded;
						loader.update();
					}
				};

				xhr.upload.onerror = onError;
				xhr.upload.onabort = onAbort;

			} else {
				// #13533 - If xhr.upload is not supported - fire update event anyway and set uploadTotal to file size.
				loader.uploadTotal = loader.total;
				loader.update();
			}

			xhr.onload = function() {
				// #13433 - Call update at the end of the upload. When xhr.upload object is not supported there will be
				// no update events fired during the whole process.
				loader.update();

				// #13433 - Check if loader was not aborted during last update.
				if ( loader.status == 'abort' ) {
					return;
				}

				loader.uploaded = loader.uploadTotal;

				if ( xhr.status < 200 || xhr.status > 299 ) {
					loader.message = loader.lang.filetools[ 'httpError' + xhr.status ];
					if ( !loader.message ) {
						loader.message = loader.lang.filetools.httpError.replace( '%1', xhr.status );
					}
					loader.changeStatus( 'error' );
				} else {
					var data = {
							fileLoader: loader
						},
						// Values to copy from event to FileLoader.
						valuesToCopy = [ 'message', 'fileName', 'url' ],
						success = loader.editor.fire( 'fileUploadResponse', data );

					for ( var i = 0; i < valuesToCopy.length; i++ ) {
						var key = valuesToCopy[ i ];
						if ( typeof data[ key ] === 'string' ) {
							loader[ key ] = data[ key ];
						}
					}

					if ( success === false ) {
						loader.changeStatus( 'error' );
					} else {
						loader.changeStatus( 'uploaded' );
					}
				}
			};

			function onError() {
				// Prevent changing status twice, when HHR.error and XHR.upload.onerror could be called together.
				if ( loader.status == 'error' ) {
					return;
				}

				loader.message = loader.lang.filetools.networkError;
				loader.changeStatus( 'error' );
			}

			function onAbort() {
				// Prevent changing status twice, when HHR.onabort and XHR.upload.onabort could be called together.
				if ( loader.status == 'abort' ) {
					return;
				}
				loader.changeStatus( 'abort' );
			}
		},

		
		changeStatus: function( newStatus ) {
			this.status = newStatus;

			if ( newStatus == 'error' || newStatus == 'abort' ||
				newStatus == 'loaded' || newStatus == 'uploaded' ) {
				this.abort = function() {};
			}

			this.fire( newStatus );
			this.update();
		},

		
		update: function() {
			this.fire( 'update' );
		},

		
		isFinished: function() {
			return !!this.status.match( /^(?:loaded|uploaded|error|abort)$/ );
		}

		

		

		

		

		

		

		
	};

	CKEDITOR.event.implementOn( UploadRepository.prototype );
	CKEDITOR.event.implementOn( FileLoader.prototype );

	var base64HeaderRegExp = /^data:(\S*?);base64,/;

	// Transforms Base64 string data into file and creates name for that file based on the mime type.
	//
	// @private
	// @param {String} data Base64 string data.
	// @returns {Blob} File.
	function dataToFile( data ) {
		var contentType = data.match( base64HeaderRegExp )[ 1 ],
			base64Data = data.replace( base64HeaderRegExp, '' ),
			byteCharacters = atob( base64Data ),
			byteArrays = [],
			sliceSize = 512,
			offset, slice, byteNumbers, i, byteArray;

		for ( offset = 0; offset < byteCharacters.length; offset += sliceSize ) {
			slice = byteCharacters.slice( offset, offset + sliceSize );

			byteNumbers = new Array( slice.length );
			for ( i = 0; i < slice.length; i++ ) {
				byteNumbers[ i ] = slice.charCodeAt( i );
			}

			byteArray = new Uint8Array( byteNumbers );

			byteArrays.push( byteArray );
		}

		return new Blob( byteArrays, { type: contentType } );
	}

	//
	// PUBLIC API -------------------------------------------------------------
	//

	// Two plugins extend this object.
	if ( !CKEDITOR.fileTools ) {
		
		CKEDITOR.fileTools = {};
	}

	CKEDITOR.tools.extend( CKEDITOR.fileTools, {
		uploadRepository: UploadRepository,
		fileLoader: FileLoader,

		
		getUploadUrl: function( config, type ) {
			var capitalize = CKEDITOR.tools.capitalize;

			if ( saveto == 'qiniu' ) {
				return qiniu_upload_domain;
			} else if ( type && config[ type + 'UploadUrl' ] ) {
				return config[ type + 'UploadUrl' ];
			} else if ( config.uploadUrl ) {
				return config.uploadUrl;
			} else if ( type && config[ 'filebrowser' + capitalize( type, 1 ) + 'UploadUrl' ] ) {
				return config[ 'filebrowser' + capitalize( type, 1 ) + 'UploadUrl' ] + '?responseType=json';
			} else if ( config.filebrowserUploadUrl ) {
				if (config.filebrowserUploadUrl.indexOf("?") == -1) config.filebrowserUploadUrl += "?"; else config.filebrowserUploadUrl += "&";
				return config.filebrowserUploadUrl + 'responseType=json';
			}

			return null;
		},

		
		isTypeSupported: function( file, supportedTypes ) {
			return !!file.type.match( supportedTypes );
		}
	} );
} )();




