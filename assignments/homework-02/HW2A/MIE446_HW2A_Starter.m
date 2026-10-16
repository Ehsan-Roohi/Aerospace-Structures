%% MIE 446 HW2A -- Read the Evidence, then Locate the Force (Part 3)
% Student starter, Version 2 (October 1, 2026).
% Complete every TODO; do not replace unknowns with zero.
% Read the matching numbered steps in MIE446_HW2A_Evidence_and_Moment_Geometry.pdf.
% All calculations use SI units.
% Part 3: +x forward, +y aircraft right, +z down; moments about the CG.
% Part 1 (paper readings) is completed in the Excel Paper sheet, not here.
% Run this setup first, then use Run Section in the MATLAB Editor.
% No add-on toolbox is needed. NaN means an unfinished answer, not zero.
clear; close all; clc;
format long g;                     % retain precision when comparing with Excel
scriptFolder = fileparts(mfilename('fullpath'));
if isempty(scriptFolder), scriptFolder = pwd; end
outputFolder = fullfile(scriptFolder, 'hw2a_outputs');
if ~exist(outputFolder, 'dir'), mkdir(outputFolder); end
fprintf('Outputs will be written to: %s\n', outputFolder);

%% 0. Practice examples -- completed, not assessed data
r_demo = [0.20, 0, 0];             % m; ROW vector
F_point_demo = [0, 0, 3];          % N; ROW vector
M_demo = cross(r_demo, F_point_demo);
fprintf('Practice moment: [%.3f %.3f %.3f] N m\n', M_demo);
% Expected practice moment = [0 -0.6 0] N m. Order is cross(r,F).

%% 3. A lateral force at three locations -- TODO
rCases = [0,0.35,0; -0.15,0.35,0.04; -0.15,0.35,-0.04]; % m
Fside = [0,2,0];                   % N
sideMoments = NaN(3,3);            % rows A/B/C; cols Mx/My/Mz in N m
for j = 1:3
    sideMoments(j,:) = NaN(1,3);   % TODO: cross(rCases(j,:),Fside)
end
if all(isfinite(sideMoments(:)))
    sideTable = array2table([rCases,sideMoments], 'VariableNames', ...
        {'x_m','y_m','z_m','Mx_Nm','My_Nm','Mz_Nm'});
    disp(sideTable);
    writetable(sideTable,fullfile(outputFolder,'Q3_side_force.csv'));
else
    fprintf('Q3 incomplete: fill the cross-product expression after predicting signs.\n');
end

%% Submission reminder
fprintf(['Save this completed .m file, your completed Excel workbook (Paper and Controls sheets),\n' ...
    'and your own HW 2A PDF report with the short process note.\n' ...
    'The slide, README and Engineering Judgment Record are submitted with HW 2B.\n' ...
    'A script that runs with unfinished NaN entries is not a completed assignment.\n']);
