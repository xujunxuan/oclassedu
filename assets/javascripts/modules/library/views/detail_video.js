define([
    'app'
    , 'text!modules/library/templates/detail_video.html'
    , 'jwplayer'
    , 'ionRangeSlider'
],function(
    app
    , template
){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore',
            'click .open-control': 'toggleEditor',
            'click #video-preview-btn': 'preview',
            'click #video-save-btn': 'save'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            var _this = this;
            this.$el.html(this.template(this.model.toJSON()));
            this.$('#download-range').ionRangeSlider({
                min: 0,
                max: 3600,
                type: 'double',
                prefix: '',
                step: 10,
                from: 0,
                to: 300,
                onLoad: function(obj) {
                    $('#video-preview-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                    $('#video-save-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                },
                onFinish: function(obj) {
                    $('#video-preview-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                    $('#video-save-btn').data('start', obj.fromNumber).data('end', obj.toNumber);
                }
            });
            var playlist = [{
                image: this.model.get('data_info').content.image.url_path
                , file:  this.model.get('data_info').content.file.url_path
                , title: this.model.get('data_info').content.title
                , type: this.model.get('data_info').content.file.type

            }];
            _.each(this.model.get('related_data'),function(play){
                playlist.push({
                    image: play.content.image.url_path,
                    file: play.content.file.url_path,
                    title: play.content.title
                });
            });
            this.player = jwplayer('video-player').setup({
                    base: 'assets/player/'
                    , height: function(){
                        var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                        if(width > 767){
                            return 560;
                        }else{
                            return 240;
                        }
                    }()
                    , width: '100%'
                    , autostart: true
                    , startparam: 'start'
                    , primary: 'flash'
                    //, listbar: function(){
                    //    var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                    //    if(width > 767){
                    //        return {
                    //            position: 'right',
                    //            layout: 'extended',
                    //            size: '25%'
                    //        };
                    //    }else{
                    //        return {
                    //            position: 'bottom',
                    //            layout: 'basic',
                    //            size: '25%'
                    //        };
                    //    }
                    //}()
                    , playlist: playlist
                })
                //.onPlay(function(){
                //    _this.$('#download-range').ionRangeSlider('update', {
                //        max: Math.floor(this.getDuration()),
                //        to: Math.floor(this.getDuration() / 4)
                //    });
                //})
                .onPlaylistItem(function(){
                    _this.$('#player h1').text(this.getPlaylistItem().title);
                    _this.$('#video-preview-btn').data('url', this.getPlaylistItem().file);
                    _this.$('#video-save-btn').data('url', this.getPlaylistItem().file);
                    _this.$('#video-full-btn').data('url', this.getPlaylistItem().file);
                });
            return this;
        }
        , preview: function(e){
            e.preventDefault();
            var _this = this,
                $this = $(e.currentTarget),
                start = $this.data('start'),
                end = $this.data('end'),
                url = $this.data('url'),
                title = this.model.get('data_info').content.title,
                type = this.model.get('data_info').content.file.type,
                file = '/play/save/?start='+start+'&end='+end+'&url='+url;
            $('#preview').on('shown.bs.modal', function(){
                _this.player.pause();
                jwplayer('preview-player').setup({
                    base: 'assets/player/'
                    , height: 460
                    , width: '100%'
                    , autostart: true
                    , startparam: 'start'
                    , primary: 'flash'
                    , sources: [
                        {
                            title: title,
                            file: file,
                            type: type
                        }
                    ]
                });
            }).modal('show');
        }
        , save: function(e){
            e.preventDefault();
            var $this = $(e.currentTarget),
                start = $this.data('start'),
                end = $this.data('end'),
                url = $this.data('url'),
                title = this.model.get('data_info').content.title,
                type = this.model.get('data_info').content.file.type,
                name = title+'.'+type,
                file = '/play/save/?start='+start+'&end='+end+'&url='+url+'&name='+name;
            window.open(file);
        }
        , toggleEditor: function(e){
            this.$("#editor").removeClass('closed');
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});